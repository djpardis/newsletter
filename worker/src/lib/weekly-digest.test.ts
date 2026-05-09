import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import {
  collectWeeklyDigest,
  renderWeeklyDigestText,
  sendWeeklyDigest,
  shouldSendWeeklyDigest,
} from "./weekly-digest.js";

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

  async all<T>(): Promise<D1Result<T>> {
    return {
      results: this.db.rowsFor<T>(this.sql),
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
    return this.db.firstFor<T>(this.sql);
  }
}

class MockD1 {
  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  rowsFor<T>(sql: string): T[] {
    if (sql.includes("FROM subscribers") && sql.includes("created_at >=")) {
      return [
        {
          email: "new@example.com",
          created_at: Date.UTC(2026, 4, 8, 16),
          source: "homepage",
          status: "active",
        },
        {
          email: "real.djpardis+test@gmail.com",
          created_at: Date.UTC(2026, 4, 7, 16),
          source: "homepage",
          status: "active",
        },
        {
          email: "realdjpardis@gmail.com",
          created_at: Date.UTC(2026, 4, 8, 17),
          source: "homepage",
          status: "active",
        },
        {
          email: "pending@example.com",
          created_at: Date.UTC(2026, 4, 8, 18),
          source: "homepage",
          status: "pending",
        },
      ] as T[];
    }
    if (sql.includes("subscribe_reactivated")) {
      return [
        {
          email: "returning@example.com",
          created_at: Date.UTC(2026, 4, 7, 15),
          source: "footer",
          status: "active",
        },
      ] as T[];
    }
    if (sql.includes("subscriber_unsubscribed")) {
      return [
        {
          email: "old@example.com",
          created_at: Date.UTC(2026, 4, 6, 14),
          source: "homepage",
          status: "unsubscribed",
        },
      ] as T[];
    }
    if (sql.includes("webhook_bounced")) {
      return [
        {
          email: "bounce@example.com",
          created_at: Date.UTC(2026, 4, 5, 13),
          source: "unknown",
          status: "bounced",
        },
      ] as T[];
    }
    if (sql.includes("webhook_complained")) {
      return [] as T[];
    }
    if (sql.includes("GROUP BY status")) {
      return [
        { status: "active", count: 10 },
        { status: "pending", count: 2 },
        { status: "unsubscribed", count: 3 },
        { status: "bounced", count: 1 },
      ] as T[];
    }
    if (sql.includes("FROM campaigns c")) {
      return [
        {
          id: "campaign-1",
          slug: "weekly-update",
          subject: "Weekly update",
          sent_at: Date.UTC(2026, 4, 8, 12),
          sent: 9,
          failed: 1,
        },
      ] as T[];
    }
    if (sql.includes("GROUP BY COALESCE")) return [{ source: "homepage", count: 4 }] as T[];
    return [] as T[];
  }

  firstFor<T>(sql: string): T | null {
    if (sql.includes("status = 'pending'")) {
      return { count: 2 } as T;
    }
    return null;
  }
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    BASE_URL: "https://newsletter.example.com",
    DB: new MockD1() as unknown as D1Database,
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    RESEND_API_KEY: "resend",
    SITE_NAME: "Example Newsletter",
    ...overrides,
  } as Env;
}

describe("weekly digest", () => {
  const monday = Date.UTC(2026, 4, 11, 12);
  const tuesday = Date.UTC(2026, 4, 12, 12);

  it("only gates scheduled sends to Mondays in UTC", () => {
    expect(shouldSendWeeklyDigest(monday)).toBe(true);
    expect(shouldSendWeeklyDigest(tuesday)).toBe(false);
  });

  it("collects and renders the weekly digest summary", async () => {
    const summary = await collectWeeklyDigest(env(), monday);
    const text = renderWeeklyDigestText(env(), summary);

    expect(text).toContain("Example Newsletter weekly newsletter digest");
    expect(text).toContain("New rows: 4");
    expect(text).toContain("Reactivated: 1");
    expect(text).toContain("Unsubscribed: 1");
    expect(text).toContain("Net change: +4");
    expect(text).toContain("Unique new active emails listed: 2");
    expect(text).toContain("new@example.com - active - homepage");
    expect(text).toContain("realdjpardis@gmail.com - active - homepage");
    expect(text).not.toContain("real.djpardis+test@gmail.com");
    expect(text).not.toContain("pending@example.com");
    expect(text).toContain("returning@example.com");
    expect(text).toContain("old@example.com");
    expect(text).toContain("Weekly update (weekly-update) - 9 sent, 1 failed");
    expect(text).toContain("2 pending confirmations older than 48 hours");
    expect(text).toContain("1 bounce events this week");
  });

  it("uses DIGEST_EMAIL before NOTIFY_EMAIL when sending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ id: "email-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await sendWeeklyDigest(
      env({
        DIGEST_EMAIL: "digest@example.com",
        NOTIFY_EMAIL: "notify@example.com",
      }),
      monday,
    );

    expect(result).toEqual({ sent: true });
    const payload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(payload.to).toEqual(["digest@example.com"]);
    expect(payload.subject).toBe("Example Newsletter weekly digest");
    expect(payload.text).toContain("New rows: 4");
    vi.unstubAllGlobals();
  });

  it("does not send when no digest recipient is configured", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await sendWeeklyDigest(env(), monday);

    expect(result).toEqual({
      sent: false,
      reason: "recipient_not_configured",
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
