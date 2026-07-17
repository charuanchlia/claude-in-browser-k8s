import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export type CoreEvent =
  | { type: "assistant"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "mcp_status"; servers: { name: string; status: string }[] }
  | { type: "result"; ok: boolean; durationMs?: number; apiMs?: number; ttftMs?: number; detail?: string }
  | { type: "error"; message: string };

export function translate(msg: SDKMessage): CoreEvent[] {
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        return [{ type: "mcp_status", servers: msg.mcp_servers ?? [] }];
      }
      return [];
    case "assistant": {
      const events: CoreEvent[] = [];
      if (msg.error) events.push({ type: "error", message: msg.error });
      for (const block of (msg.message?.content ?? []) as any[]) {
        if (block.type === "text") events.push({ type: "assistant", text: block.text });
        else if (block.type === "tool_use") events.push({ type: "tool_call", name: block.name, input: block.input });
      }
      return events;
    }
    case "result":
      if (msg.subtype === "success") {
        return [{ type: "result", ok: true, durationMs: msg.duration_ms, apiMs: msg.duration_api_ms, ttftMs: msg.ttft_ms }];
      }
      return [{ type: "result", ok: false, detail: msg.subtype }];
    default:
      return [];
  }
}
