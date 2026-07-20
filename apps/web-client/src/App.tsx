import { useState, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@claude-lab/protocol";
import { connect } from "./ws.js";
import { McpPanel } from "./McpPanel.js";

type Line = { who: "you" | "claude" | "sys"; text: string };

export function App() {
  const [username, setUsername] = useState("");
  const [joined, setJoined] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [servers, setServers] = useState<{ name: string; status: string }[]>([]);
  const [status, setStatus] = useState("connecting…");
  const conn = useRef<ReturnType<typeof connect> | null>(null);

  const onMsg = (m: ServerMessage) => {
    if (m.type === "session.status") setStatus(m.state === "ready" ? "ready" : `${m.state}: ${m.detail ?? ""}`);
    else if (m.type === "assistant") setLines((l) => [...l, { who: "claude", text: m.text }]);
    else if (m.type === "tool_call") setLines((l) => [...l, { who: "sys", text: `⚙︎ ${m.name}(${JSON.stringify(m.input)})` }]);
    else if (m.type === "mcp.status") setServers(m.servers);
    else if (m.type === "result") setLines((l) => [...l, { who: "sys", text: `— done (api ${m.apiMs ?? "?"}ms, ttft ${m.ttftMs ?? "?"}ms)` }]);
    else if (m.type === "error") setLines((l) => [...l, { who: "sys", text: `⚠ ${m.message}` }]);
  };

  const join = () => { if (!username.trim()) return; conn.current = connect(username.trim(), onMsg); setJoined(true); };
  const send = (m: ClientMessage) => conn.current?.send(m);
  const ask = (text: string) => { if (!text.trim()) return; setLines((l) => [...l, { who: "you", text }]); send({ type: "prompt", text }); };

  if (!joined) return (
    <div className="join">
      <h1>Claude Lab</h1>
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your name" onKeyDown={(e) => e.key === "Enter" && join()} />
      <button onClick={join}>Start my pod</button>
    </div>
  );

  return (
    <div className="app">
      <div className="chat">
        <header>pod: agent-{username.toLowerCase()} · <span className="status">{status}</span></header>
        <div className="lines">{lines.map((l, i) => <div key={i} className={`line ${l.who}`}>{l.text}</div>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); const inp = (e.currentTarget.elements.namedItem("q") as HTMLInputElement); ask(inp.value); inp.value = ""; }}>
          <input name="q" placeholder="ask Claude to do something…" autoFocus />
          <button type="submit">Send</button>
        </form>
      </div>
      <McpPanel servers={servers} onAdd={send} />
    </div>
  );
}
