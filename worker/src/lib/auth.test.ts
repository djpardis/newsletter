import { describe, expect, it } from "vitest";
import { authorizeBearer } from "./auth.js";

describe("authorizeBearer", () => {
  it("accepts matching token", () => {
    const req = new Request("https://x", {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(authorizeBearer(req, "secret-token")).toBe(true);
  });
  it("rejects wrong token", () => {
    const req = new Request("https://x", {
      headers: { Authorization: "Bearer other" },
    });
    expect(authorizeBearer(req, "secret-token")).toBe(false);
  });
  it("rejects missing header", () => {
    const req = new Request("https://x");
    expect(authorizeBearer(req, "secret-token")).toBe(false);
  });
});
