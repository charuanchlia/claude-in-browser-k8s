import * as k8s from "@kubernetes/client-node";

const NAMESPACE = process.env.NAMESPACE ?? "claude-lab";
const POD_IMAGE = process.env.POD_IMAGE ?? "claude-lab/pod-server:dev";
const SECRET_NAME = process.env.TOKEN_SECRET ?? "claude-token";

const kc = new k8s.KubeConfig();
kc.loadFromCluster(); // in-cluster ServiceAccount
const core = kc.makeApiClient(k8s.CoreV1Api);

export interface PodHandle { name: string; ip: string; }

function podManifest(name: string): k8s.V1Pod {
  return {
    metadata: { name, namespace: NAMESPACE, labels: { app: "claude-agent" } },
    spec: {
      restartPolicy: "Never",
      containers: [{
        name: "agent",
        image: POD_IMAGE,
        imagePullPolicy: "IfNotPresent", // image is kind-loaded, not in a registry
        ports: [{ containerPort: 8080 }],
        env: [{
          name: "CLAUDE_CODE_OAUTH_TOKEN",
          valueFrom: { secretKeyRef: { name: SECRET_NAME, key: "token" } },
        }],
        resources: { requests: { cpu: "250m", memory: "512Mi" }, limits: { cpu: "1", memory: "1Gi" } },
      }],
    },
  };
}

/** Create the pod (idempotent) and wait until it has an IP and is Running. */
export async function ensurePod(name: string, timeoutMs = 60000): Promise<PodHandle> {
  try {
    await core.createNamespacedPod(NAMESPACE, podManifest(name));
  } catch (e: any) {
    if (e?.body?.reason !== "AlreadyExists" && e?.statusCode !== 409) throw e;
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await core.readNamespacedPod(name, NAMESPACE);
    const phase = res.body.status?.phase;
    const ip = res.body.status?.podIP;
    if (phase === "Running" && ip) return { name, ip };
    if (phase === "Failed") throw new Error(`pod ${name} failed to start`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`pod ${name} not ready within ${timeoutMs}ms`);
}

export async function deletePod(name: string): Promise<void> {
  try { await core.deleteNamespacedPod(name, NAMESPACE); } catch { /* already gone */ }
}

/**
 * Startup safety net: delete stale agent pods left behind by a previous gateway process.
 *
 * This is unconditional — it deletes every agent pod on startup, including ones serving a
 * browser tab that's still open (that user's WebSocket just breaks; no reconnect logic
 * exists client-side). Acceptable for this prototype (spec's stated non-goals: no HA, no
 * persistence), but a real deployment would need the gateway to survive restarts without
 * dropping live sessions — e.g. by tracking which pods have an active proxy connection.
 */
export async function sweepStalePods(): Promise<void> {
  const res = await core.listNamespacedPod(
    NAMESPACE,
    undefined, undefined, undefined, undefined,
    "app=claude-agent",
  );
  await Promise.all((res.body.items ?? []).map((p) => deletePod(p.metadata!.name!)));
}
