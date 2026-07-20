import { WebSocketServer, WebSocket } from "ws";
import { createSession, type Session, type CoreEvent } from "@claude-lab/agent-core";
import type { ClientMessage, ServerMessage, McpServerSpec } from "@claude-lab/protocol";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

const PORT = Number(process.env.PORT ?? 8080);

// Default baked-in MCP server so MCP works out of the box.
const defaultMcp: Record<string, McpServerConfig> = {
  files: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"] } as McpServerConfig,
};

function specToConfig(s: McpServerSpec): McpServerConfig {
  if (s.transport === "http") return { type: "http", url: s.url } as McpServerConfig;
  if (s.transport === "sse") return { type: "sse", url: s.url } as McpServerConfig;
  return { type: "stdio", command: s.command, args: s.args ?? [] } as McpServerConfig;
}

function coreToServer(e: CoreEvent): ServerMessage {
  switch (e.type) {
    case "mcp_status": return { type: "mcp.status", servers: e.servers };
    case "assistant": return { type: "assistant", text: e.text };
    case "tool_call": return { type: "tool_call", name: e.name, input: e.input };
    case "result": return { type: "result", ok: e.ok, durationMs: e.durationMs, apiMs: e.apiMs, ttftMs: e.ttftMs, detail: e.detail };
    case "error": return { type: "error", message: e.message };
  }
}

const wss = new WebSocketServer({ port: PORT, host: "0.0.0.0" });
console.log(`pod-server listening on :${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  const send = (m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  const mcpServers: Record<string, McpServerConfig> = { ...defaultMcp };
  const session: Session = createSession((e) => send(coreToServer(e)), { cwd: "/workspace", mcpServers });
  send({ type: "session.status", state: "ready" });

  // The system/init snapshot (translated to the first mcp.status) is taken
  // before stdio MCP servers finish their handshake, so it's typically stuck
  // on "pending". Push one real status update shortly after connect so the
  // panel reflects the baked-in server's actual settled state.
  setTimeout(() => {
    session.getMcpStatus()
      .then((servers) => send({ type: "mcp.status", servers }))
      .catch(() => {}); // best-effort; the client can always send mcp.list
  }, 5000);

  ws.on("message", async (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()); } catch { console.error("dropped malformed WS message:", raw.toString()); return; }
    if (msg.type === "prompt") session.sendPrompt(msg.text);
    else if (msg.type === "ping") send({ type: "pong", t: msg.t });
    else if (msg.type === "mcp.add") {
      mcpServers[msg.name] = specToConfig(msg.server);
      try {
        await session.setMcpServers(mcpServers);
        // setMcpServers() resolves with its own result rather than emitting a
        // system/init-style event — fetch and push real status explicitly.
        send({ type: "mcp.status", servers: await session.getMcpStatus() });
      }
      catch (e) { send({ type: "error", message: `mcp.add failed: ${e instanceof Error ? e.message : e}` }); }
    }
    else if (msg.type === "mcp.list") {
      try { send({ type: "mcp.status", servers: await session.getMcpStatus() }); }
      catch (e) { send({ type: "error", message: `mcp.list failed: ${e instanceof Error ? e.message : e}` }); }
    }
  });

  ws.on("close", () => { session.dispose().catch(() => {}); });
});
