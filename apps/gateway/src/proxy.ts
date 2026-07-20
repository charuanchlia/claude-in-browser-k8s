import { WebSocket } from "ws";
import type { ServerMessage } from "@claude-lab/protocol";

const CONNECT_RETRY_MS = 300;
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Pipe messages both ways between an already-open browser socket and the pod socket.
 *
 * A pod reported "Running" by Kubernetes has only had its container process started —
 * pod-server's own WebSocket server (a Node/tsx process) can take a moment longer to
 * actually bind its port. Connecting immediately can race that gap and hit ECONNREFUSED.
 * We retry briefly rather than fail the whole session on a race that resolves itself
 * within a second in practice.
 */
export function proxy(browser: WebSocket, podUrl: string, onClose: () => void, replay: string[] = []): void {
  const toBrowser = (m: ServerMessage) => browser.readyState === browser.OPEN && browser.send(JSON.stringify(m));
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let pod: WebSocket;
  let settled = false;

  const attach = () => {
    pod.on("open", () => {
      toBrowser({ type: "session.status", state: "ready" });
      for (const raw of replay) pod.send(raw);
    });
    pod.on("message", (d) => browser.readyState === browser.OPEN && browser.send(d.toString()));
    pod.on("close", () => { if (settled) browser.close(); });
    pod.on("error", (e: NodeJS.ErrnoException) => {
      if (settled) { toBrowser({ type: "error", message: `pod socket error: ${e.message}` }); return; }
      if (e.code === "ECONNREFUSED" && Date.now() < deadline) {
        setTimeout(connect, CONNECT_RETRY_MS); // pod-server likely hasn't bound its port yet — retry
        return;
      }
      settled = true;
      toBrowser({ type: "error", message: `pod socket error: ${e.message}` });
      browser.close();
    });
  };

  const connect = () => {
    pod = new WebSocket(podUrl);
    pod.once("open", () => { settled = true; });
    attach();
  };
  connect();

  browser.on("message", (d) => pod?.readyState === pod?.OPEN && pod.send(d.toString()));
  browser.on("close", () => { pod?.close(); onClose(); });
}
