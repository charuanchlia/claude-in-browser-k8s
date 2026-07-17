// Wire types shared by web-client, gateway, and pod-server.

export type McpServerSpec =
  | { transport: "http"; url: string }
  | { transport: "sse"; url: string }
  | { transport: "stdio"; command: string; args?: string[] };

/** Browser -> gateway -> pod */
export type ClientMessage =
  | { type: "hello"; username: string }
  | { type: "prompt"; text: string }
  | { type: "mcp.add"; name: string; server: McpServerSpec }
  | { type: "mcp.list" }
  | { type: "ping"; t: number }; // for in-cluster latency measurement

/** Pod -> gateway -> browser */
export type ServerMessage =
  | { type: "session.status"; state: "starting" | "ready" | "error"; detail?: string }
  | { type: "assistant"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "mcp.status"; servers: { name: string; status: string }[] }
  | { type: "result"; ok: boolean; durationMs?: number; apiMs?: number; ttftMs?: number; detail?: string }
  | { type: "pong"; t: number }
  | { type: "error"; message: string };
