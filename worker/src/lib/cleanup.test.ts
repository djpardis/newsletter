import { describe, expect, it } from "vitest";
import type { Env } from "../types.js";
import { runCleanup } from "./cleanup.js";

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

  async run(): Promise<D1Result> {
    this.db.runs.push({ sql: this.sql, args: this.args });
    const changes = this.db.changesFor(this.sql);
    return {
      results: [],
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: changes,
        last_row_id: 0,
        changed_db: changes > 0,
        changes,
      },
    };
  }
}

class MockD1 {
  readonly runs: Array<{ sql: string; args: unknown[] }> = [];

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  changesFor(sql: string): number {
    if (sql.includes("DELETE FROM rate_limits")) return 1;
    if (sql.includes("used_at IS NOT NULL")) return 2;
    if (sql.includes("DELETE FROM verification_tokens")) return 3;
    if (sql.includes("DELETE FROM subscribers")) return 4;
    if (sql.includes("DELETE FROM events_audit")) return 5;
    if (sql.includes("UPDATE events_audit")) return 6;
    return 0;
  }
}

function env(db: MockD1): Env {
  return {
    BASE_URL: "https://newsletter.example.com",
    DB: db as unknown as D1Database,
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    RESEND_API_KEY: "resend",
  } as Env;
}

describe("runCleanup", () => {
  it("removes pending subscribers after their confirm token retention window", async () => {
    const db = new MockD1();
    const now = Date.UTC(2026, 4, 11, 12);

    const summary = await runCleanup(env(db), now);

    expect(summary).toEqual({
      rate_limits: 1,
      verification_tokens: 5,
      pending_subscribers: 4,
      events_audit: 5,
    });
    expect(
      db.runs.some(
        (run) =>
          run.sql.includes("UPDATE events_audit") &&
          run.sql.includes("SET subscriber_id = NULL"),
      ),
    ).toBe(true);
    expect(
      db.runs.some(
        (run) =>
          run.sql.includes("DELETE FROM subscribers") &&
          run.sql.includes("status = 'pending'") &&
          run.sql.includes("expires_at >="),
      ),
    ).toBe(true);
  });
});
