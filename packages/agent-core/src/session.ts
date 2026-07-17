import { query, type Query, type SDKUserMessage, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { createPushable, type Pushable } from "./pushable.js";
import { translate, type CoreEvent } from "./translate.js";

export interface SessionOptions {
  cwd?: string;
  mcpServers?: Record<string, McpServerConfig>;
}

export interface Session {
  sendPrompt(text: string): void;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<void>;
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
    sendPrompt(text: string) { input.push(userMessage(text)); },
    async setMcpServers(servers) { await q.setMcpServers(servers); },
    async dispose() { input.end(); await q.interrupt().catch(() => {}); },
  };
}
