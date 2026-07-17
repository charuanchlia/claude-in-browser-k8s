import { describe, it, expect } from "vitest";
import { translate, type CoreEvent } from "../src/translate.js";

describe("translate", () => {
  it("maps a system/init message to mcp_status", () => {
    const out = translate({
      type: "system", subtype: "init",
      mcp_servers: [{ name: "files", status: "connected" }],
    } as any);
    expect(out).toEqual([{ type: "mcp_status", servers: [{ name: "files", status: "connected" }] }]);
  });

  it("maps assistant text and tool_use blocks", () => {
    const out = translate({
      type: "assistant",
      message: { content: [
        { type: "text", text: "hello" },
        { type: "tool_use", name: "Bash", input: { command: "ls" } },
      ] },
    } as any);
    expect(out).toEqual([
      { type: "assistant", text: "hello" },
      { type: "tool_call", name: "Bash", input: { command: "ls" } },
    ]);
  });

  it("maps a success result with latency fields", () => {
    const out = translate({
      type: "result", subtype: "success",
      duration_ms: 1200, duration_api_ms: 900, ttft_ms: 300,
    } as any);
    expect(out).toEqual([{ type: "result", ok: true, durationMs: 1200, apiMs: 900, ttftMs: 300 }]);
  });

  it("maps an error result", () => {
    const out = translate({ type: "result", subtype: "error_max_turns" } as any);
    expect(out).toEqual([{ type: "result", ok: false, detail: "error_max_turns" }]);
  });

  it("surfaces assistant auth errors", () => {
    const out = translate({
      type: "assistant", error: "authentication_failed",
      message: { content: [] },
    } as any);
    expect(out).toEqual([{ type: "error", message: "authentication_failed" }]);
  });

  it("ignores unhandled message types", () => {
    expect(translate({ type: "stream_event" } as any)).toEqual([]);
  });
});
