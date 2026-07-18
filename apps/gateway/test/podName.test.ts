import { describe, it, expect } from "vitest";
import { podName } from "../src/podName.js";

describe("podName", () => {
  it("prefixes and lowercases", () => {
    expect(podName("Charu")).toBe("agent-charu");
  });
  it("replaces invalid chars with hyphens", () => {
    expect(podName("a b_c!")).toBe("agent-a-b-c");
  });
  it("is deterministic (same user -> same pod)", () => {
    expect(podName("alex")).toBe(podName("alex"));
  });
  it("trims to a DNS-safe length and strips trailing hyphens", () => {
    const n = podName("x".repeat(80));
    expect(n.length).toBeLessThanOrEqual(63);
    expect(n.endsWith("-")).toBe(false);
  });
});
