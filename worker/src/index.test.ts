import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";
import type { Env } from "./types.js";

describe("required configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names missing settings instead of failing inside a route", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = { DB: {} as D1Database, RESEND_API_KEY: "", ADMIN_BEARER_TOKEN: "" } as unknown as Env;

    const res = await worker.fetch(
      new Request("http://localhost:8787/api/subscribe", { method: "POST", body: "{}" }),
      env,
      {} as ExecutionContext,
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "missing_config", missing: ["BASE_URL", "FROM_EMAIL"] });
  });
});
