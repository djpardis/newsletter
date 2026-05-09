import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import { sha256Hex } from "../lib/crypto.js";
import { handleConfirm } from "./confirm.js";

class MockStatement {
  private args: unknown[] = [];

  constructor(
    private readonly db: MockD1,
    private readonly sql: string,
  ) {}

  bind(...args: unknown[]): MockStatement {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("FROM verification_tokens")) {
      return this.db.confirmRow as T | null;
    }
    return null;
  }

  async run(): Promise<D1Result> {
    this.db.runs.push({ sql: this.sql, args: this.args });
    return {
      results: [],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: 0,
        last_row_id: 0,
        changed_db: true,
        changes: 1,
      },
    };
  }
}

class MockD1 {
  confirmRow: unknown = null;
  readonly runs: Array<{ sql: string; args: unknown[] }> = [];

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  async batch(statements: MockStatement[]): Promise<D1Result[]> {
    return Promise.all(statements.map((s) => s.run()));
  }
}

function envWithDb(db: MockD1): Env {
  return {
    ADMIN_BEARER_TOKEN: "secret",
    BASE_URL: "https://newsletter.example.com",
    DB: db as unknown as D1Database,
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    NOTIFY_EMAIL: "operator@example.com",
    RESEND_API_KEY: "resend",
    SITE_NAME: "Vance Refrigeration",
  };
}

describe("handleConfirm", () => {
  it("schedules an operator notification email when a subscriber confirms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ id: "email-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const db = new MockD1();
    const token = "plain-token";
    db.confirmRow = {
      vt_id: "vt-1",
      subscriber_id: "sub-1",
      expires_at: Date.now() + 100_000,
      used_at: null,
      email: "new@example.com",
      status: "pending",
      token_hash: await sha256Hex(token),
    };
    const waits: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
      passThroughOnException() {},
    } as ExecutionContext;

    const res = await handleConfirm(
      new Request(`https://newsletter.example.com/api/confirm?token=${token}`),
      envWithDb(db),
      ctx,
    );
    await Promise.all(waits);

    expect(res.status).toBe(200);
    expect(waits).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(payload.to).toEqual(["operator@example.com"]);
    expect(payload.subject).toBe("New subscriber: new@example.com");
    expect(payload.text).toContain("new@example.com just confirmed");
    vi.unstubAllGlobals();
  });
});
