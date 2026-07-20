# claude-lab

Claude Code in a browser, with one ephemeral Kubernetes pod per user — a learning project that runs
end-to-end on a local [`kind`](https://kind.sigs.k8s.io/) cluster.

Open the app in two browser tabs with two different names and watch two isolated pods spin up in
real time, each running its own agentic loop, tools, and MCP connections. Close a tab and watch its
pod disappear. This repo is the working proof of that mechanic, built and verified live.

![Topology diagram](docs/diagrams/01-topology.png)

## What this is

Three tiers plus a shared core:

| | Runs | Responsibility |
|---|---|---|
| **`apps/web-client`** | Browser | React chat UI + a mini `/mcp` panel. No API key, no tools, no loop — a thin view. |
| **`apps/gateway`** | 1 shared pod | Maps a typed username to a pod, creates/deletes that pod via the Kubernetes API, proxies the browser's WebSocket to it. |
| **`apps/pod-server`** | 1 pod per user | A thin WebSocket shell around `agent-core`, running inside the user's own ephemeral pod. |
| **`packages/agent-core`** | (library) | Wraps the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) — the agentic loop, tool execution, MCP client management. Knows nothing about WebSockets, HTTP, or Kubernetes, so the same package could power a local Mac app later with no rewrite. |
| **`packages/protocol`** | (library) | Shared TypeScript types for the WebSocket wire protocol — the contract all three apps agree on. |

Full rationale — *why* each of these boundaries exists, not just what they do — is in
[`docs/architecture.md`](docs/architecture.md).

## Why this exists

Terminal Claude Code runs its agent loop locally on your machine. This project asks: what does it take
to run that same loop **server-side, isolated per user, on demand** — the same shape as
[Claude Code on the web](https://www.anthropic.com/news/claude-code-on-the-web), rebuilt on a local
cluster you can watch and measure? See [`docs/architecture.md`](docs/architecture.md#appendix-what-claude-code-actually-does)
for what's verified from Anthropic's public docs versus what this project infers.

## Measured, on a real cluster

These aren't estimates — they're from a live two-tab end-to-end run against a running `kind` cluster
(full method in [the design spec, §9](docs/superpowers/specs/2026-07-18-claude-in-browser-k8s-design.md#9-latency-measurement-plan-the-point-of-the-exercise)):

| Metric | Measured |
|---|---|
| Pod cold-start (create → ready) | **~1.0–2.1s** |
| Browser ↔ gateway ↔ pod round trip | **2ms median** |
| Model call (`api` / time-to-first-token) | **4.6–9.9s / 2.4–2.5s**, depending on tool use |

The in-cluster hop is noise. Moving the UI to a browser costs almost nothing — the only new latency
this architecture introduces is pod cold-start, paid once per ephemeral session.

## Running it yourself

**Requirements:** Docker Desktop running, [`kind`](https://kind.sigs.k8s.io/), `kubectl`, Node 24+, and
a Claude subscription (Pro/Max) — no `ANTHROPIC_API_KEY` needed.

**1. Get a long-lived auth token from your subscription:**

```bash
claude setup-token
```

Save the printed token (starts `sk-ant-oat01-…`) to `.secrets/oauth-token` at the repo root. That path
is gitignored — it never gets committed.

**2. Install dependencies and sanity-check the build:**

```bash
npm install
npm run typecheck
npm test
```

**3. Bring up the cluster:**

```bash
./scripts/setup-cluster.sh    # creates the kind cluster, namespace, RBAC
./scripts/create-secret.sh    # pushes your token in as a k8s Secret
./scripts/build-and-load.sh   # builds both Docker images, loads them into kind
kubectl apply -f k8s/gateway.yaml
kubectl -n claude-lab rollout status deploy/gateway
```

**4. Watch pods appear in one terminal:**

```bash
kubectl -n claude-lab get pods -w
```

**5. Open the app** at [http://localhost:30080](http://localhost:30080) in a browser tab, type a name,
and start a session. Open a second tab with a different name and watch a second pod spin up in the
terminal from step 4.

**Tear down:**

```bash
kind delete cluster --name claude-lab
```

## Design docs

- [`docs/architecture.md`](docs/architecture.md) — the *why* behind every tier and boundary, plus how
  this maps to what's publicly known about Claude Code's own architecture. ([`docs/architecture.html`](docs/architecture.html)
  is the same content as a standalone styled page — open it directly in a browser for local viewing.)
- [`docs/superpowers/specs/2026-07-18-claude-in-browser-k8s-design.md`](docs/superpowers/specs/2026-07-18-claude-in-browser-k8s-design.md) —
  the full design spec: requirements, protocol, error handling, security notes, and the measured
  latency results.
- [`docs/superpowers/plans/2026-07-18-claude-in-browser-k8s.md`](docs/superpowers/plans/2026-07-18-claude-in-browser-k8s.md) —
  the task-by-task implementation plan this was built from.

## What's deliberately not here

This is a learning-grade prototype, not a production system. Explicitly out of scope:

- **Real auth** — a typed username is the entire identity model, no passwords or OIDC.
- **Persistence** — pods are ephemeral; conversation history and files vanish when a session ends.
- **Pre-warming / autoscaling** — every session pays the full pod cold-start.
- **HA** — one gateway replica; a gateway restart drops any live sessions (no reconnect logic).
- **Production credential isolation** — the subscription token is mounted directly into each pod as an
  env var. Anthropic's own Claude Code on the web keeps credentials *outside* the sandbox and proxies
  model calls instead — the honest upgrade path, noted but not built here.
- **A local Mac app** (`agent-core`'s second "shell") — designed for, not yet built.

## License

No license file yet — all rights reserved by default. Ask before reusing beyond reading/learning from it.
