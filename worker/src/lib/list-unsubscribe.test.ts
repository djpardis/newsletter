import { describe, expect, it } from "vitest";
import { listUnsubscribeHeaders } from "./list-unsubscribe.js";

describe("listUnsubscribeHeaders", () => {
  it("includes URL and Post", () => {
    const env = {
      UNSUBSCRIBE_MAILTO: "u@example.com",
    } as import("../types.js").Env;
    const h = listUnsubscribeHeaders(env, "https://x.example/unsub?token=1");
    expect(h["List-Unsubscribe"]).toContain("https://x.example/unsub?token=1");
    expect(h["List-Unsubscribe"]).toContain("mailto:u@example.com");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
