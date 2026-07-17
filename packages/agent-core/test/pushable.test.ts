import { describe, it, expect } from "vitest";
import { createPushable } from "../src/pushable.js";

describe("createPushable", () => {
  it("yields items pushed before iteration", async () => {
    const p = createPushable<number>();
    p.push(1); p.push(2); p.end();
    const got: number[] = [];
    for await (const n of p) got.push(n);
    expect(got).toEqual([1, 2]);
  });

  it("resolves items pushed after the consumer is waiting", async () => {
    const p = createPushable<string>();
    const got: string[] = [];
    const consumer = (async () => { for await (const s of p) got.push(s); })();
    await new Promise((r) => setTimeout(r, 10)); // let consumer block on empty queue
    p.push("a"); p.push("b"); p.end();
    await consumer;
    expect(got).toEqual(["a", "b"]);
  });

  it("throws if push is called after end", () => {
    const p = createPushable<number>();
    p.end();
    expect(() => p.push(1)).toThrow("push after end");
  });
});
