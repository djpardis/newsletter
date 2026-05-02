import { describe, expect, it } from "vitest";
import { sha256Hex } from "./crypto.js";

describe("sha256Hex", () => {
  it("produces 64 hex chars", async () => {
    const h = await sha256Hex("test");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[a-f0-9]+$/);
  });
});
