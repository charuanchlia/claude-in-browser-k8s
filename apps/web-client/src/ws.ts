import type { ClientMessage, ServerMessage } from "@claude-lab/protocol";

export function connect(username: string, onMsg: (m: ServerMessage) => void): {
  send: (m: ClientMessage) => void; close: () => void;
} {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const ws = new WebSocket(url);
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", username } satisfies ClientMessage));
  ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch {} };
  ws.onerror = () => onMsg({ type: "session.status", state: "error", detail: "connection error" });
  ws.onclose = () => onMsg({ type: "session.status", state: "error", detail: "disconnected" });
  return {
    send: (m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
}
