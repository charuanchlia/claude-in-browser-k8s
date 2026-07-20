import { query, type Query, type SDKUserMessage, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { createPushable, type Pushable } from "./pushable.js";
import { translate, type CoreEvent } from "./translate.js";

export interface SessionOptions {
  cwd?: string;
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpStatus { name: string; status: string }

export interface Session {
  sendPrompt(text: string): void;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<void>;
  /**
   * Live MCP connection status. The SDK's `system/init` message (mapped to a
   * `mcp_status` CoreEvent by translate.ts) is a one-shot snapshot taken at
   * session start — servers that connect after it, or are added later via
   * setMcpServers, never get a follow-up push through the event stream.
   * setMcpServers() itself resolves with the real result instead of emitting
   * an event. Callers that need current status (e.g. after adding a server)
   * must poll this explicitly.
   */
  getMcpStatus(): Promise<McpStatus[]>;
  dispose(): Promise<void>;
}

function userMessage(text: string): SDKUserMessage {
  // Minimal streaming-input user message.
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
  };
}

export function createSession(
  onEvent: (e: CoreEvent) => void,
  opts: SessionOptions = {},
): Session {
  const input: Pushable<SDKUserMessage> = createPushable<SDKUserMessage>();
  let disposed = false;

  const q: Query = query({
    prompt: input,
    options: {
      cwd: opts.cwd ?? "/workspace",
      // The pod IS the sandbox: there's no human at a terminal to approve
      // each tool call, so we bypass permissions entirely. The SDK requires
      // allowDangerouslySkipPermissions: true as an explicit safety flag
      // alongside permissionMode: "bypassPermissions" (verified in sdk.d.ts).
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      mcpServers: opts.mcpServers ?? {},
    },
  });

  // Drain the query in the background, forwarding translated events.
  (async () => {
    try {
      for await (const msg of q) {
        for (const e of translate(msg)) onEvent(e);
      }
    } catch (err) {
      onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return {
    sendPrompt(text: string) {
      if (disposed) return;
      input.push(userMessage(text));
    },
    async setMcpServers(servers) { await q.setMcpServers(servers); },
    async getMcpStatus() {
      const statuses = await q.mcpServerStatus();
      return statuses.map((s) => ({ name: s.name, status: s.status }));
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      input.end();
      await q.interrupt().catch(() => {});
    },
  };
}
