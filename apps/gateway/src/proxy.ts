import { WebSocket } from "ws";
import type { ServerMessage } from "@claude-lab/protocol";

/** Pipe messages both ways between an already-open browser socket and the pod socket. */
export function proxy(browser: WebSocket, podUrl: string, onClose: () => void): void {
  const pod = new WebSocket(podUrl);
  const toBrowser = (m: ServerMessage) => browser.readyState === browser.OPEN && browser.send(JSON.stringify(m));

  pod.on("open", () => toBrowser({ type: "session.status", state: "ready" }));
  pod.on("message", (d) => browser.readyState === browser.OPEN && browser.send(d.toString()));
  pod.on("error", (e) => toBrowser({ type: "error", message: `pod socket error: ${e.message}` }));
  pod.on("close", () => browser.close());

  browser.on("message", (d) => pod.readyState === pod.OPEN && pod.send(d.toString()));
  browser.on("close", () => { pod.close(); onClose(); });
}
