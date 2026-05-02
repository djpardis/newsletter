import { describe, expect, it } from "vitest";
import { normalizeEmail, isHoneypotTriggered, parseJsonBody } from "./validation.js";

describe("normalizeEmail", () => {
  it("normalizes and validates", () => {
    expect(normalizeEmail("  A@B.Com ")).toBe("a@b.com");
    expect(normalizeEmail("bad")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("honeypot", () => {
  it("ignores empty honeypot fields", () => {
    expect(isHoneypotTriggered({ email: "a@b.com", website: "" })).toBe(false);
    expect(isHoneypotTriggered({ email: "a@b.com" })).toBe(false);
  });
  it("triggers when honeypot filled", () => {
    expect(isHoneypotTriggered({ website: "http://spam" })).toBe(true);
  });
});

describe("parseJsonBody", () => {
  it("parses objects", () => {
    expect(parseJsonBody('{"a":1}')?.a).toBe(1);
    expect(parseJsonBody("[]")).toBeNull();
  });
});
