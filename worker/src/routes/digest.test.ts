import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import { handleWeeklyDigestTestSend } from "./digest.js";

class MockStatement {
  constructor(private readonly sql: string) {}

  bind(..._args: unknown[]): MockStatement {
    return this;
  }

  async all<T>(): Promise<D1Result<T>> {
    let results: unknown[] = [];
    if (this.sql.includes("GROUP BY status")) {
      results = [{ status: "active", count: 1 }];
    }
    return {
      results: results as T[],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
      },
    };
  }

  async first<T>(): Promise<T | null> {
    return { count: 0 } as T;
  }
}

class MockD1 {
  prepare(sql: string): MockStatement {
    return new MockStatement(sql);
  }
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    ADMIN_BEARER_TOKEN: "secret",
    BASE_URL: "https://newsletter.example.com",
    DB: new MockD1() as unknown as D1Database,
    DIGEST_EMAIL: "digest@example.com",
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    RESEND_API_KEY: "resend",
    SITE_NAME: "Example Newsletter",
    ...overrides,
  } as Env;
}

function request(token = "secret"): Request {
  return new Request("https://newsletter.example.com/api/admin/weekly-digest/test-send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

describe("handleWeeklyDigestTestSend", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ id: "email-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects unauthorized requests", async () => {
    const res = await handleWeeklyDigestTestSend(request("wrong"), env());

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the digest immediately", async () => {
    const res = await handleWeeklyDigestTestSend(request(), env());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(payload.to).toEqual(["digest@example.com"]);
    expect(payload.subject).toBe("Example Newsletter weekly digest");
  });

  it("returns a clear error when no recipient is configured", async () => {
    const res = await handleWeeklyDigestTestSend(
      request(),
      env({ DIGEST_EMAIL: undefined, NOTIFY_EMAIL: undefined }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "recipient_not_configured",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
