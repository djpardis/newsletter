import { describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import { handleSubscribe } from "./subscribe.js";

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
    if (this.sql.includes("FROM subscribers WHERE email = ?")) {
      return this.db.existingSubscriber as T | null;
    }
    if (this.sql.includes("RETURNING hit_count")) {
      return { hit_count: 1 } as T;
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
  existingSubscriber: { id: string; status: string } | null = null;
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

describe("handleSubscribe", () => {
  it("schedules an operator notification when a new subscriber row is created", async () => {
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
    const waits: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
      passThroughOnException() {},
    } as ExecutionContext;

    const res = await handleSubscribe(
      new Request("https://newsletter.example.com/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", source: "test", website: "" }),
      }),
      envWithDb(db),
      ctx,
    );
    await Promise.all(waits);

    expect(res.status).toBe(200);
    expect(waits).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    const confirmPayload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    const notifyPayload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string,
    );
    expect(confirmPayload.to).toEqual(["new@example.com"]);
    expect(confirmPayload.from).toBe("Newsletter <newsletter@example.com>");
    expect(confirmPayload.subject).toBe(
      "Confirm your subscription to Vance Refrigeration",
    );
    expect(confirmPayload.html).toContain(
      "<p>Thank you for subscribing to Vance Refrigeration.</p>",
    );
    expect(confirmPayload.html).toMatch(
      /<a href="https:\/\/newsletter\.example\.com\/api\/confirm\?token=[a-f0-9]+">Confirm<\/a> your email\./,
    );
    expect(confirmPayload.html).toContain(
      "<p>If you did not subscribe, ignore this message.</p>",
    );
    expect(confirmPayload.text).toMatch(
      /^Thank you for subscribing to Vance Refrigeration\.\n\nConfirm your email: https:\/\/newsletter\.example\.com\/api\/confirm\?token=[a-f0-9]+\n\nIf you did not subscribe, ignore this message\.$/,
    );
    expect(notifyPayload.to).toEqual(["operator@example.com"]);
    expect(notifyPayload.subject).toBe("New pending signup: new@example.com");
    expect(notifyPayload.text).toContain("new@example.com started signup");
    expect(db.runs.some((r) => /INSERT INTO subscribers/i.test(r.sql))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("schedules an operator notification when an unsubscribed address resubscribes", async () => {
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
    db.existingSubscriber = { id: "sub-1", status: "unsubscribed" };
    const waits: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
      passThroughOnException() {},
    } as ExecutionContext;

    const res = await handleSubscribe(
      new Request("https://newsletter.example.com/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "returning@example.com", source: "test", website: "" }),
      }),
      envWithDb(db),
      ctx,
    );
    await Promise.all(waits);

    expect(res.status).toBe(200);
    expect(waits).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    const notifyPayload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body as string,
    );
    expect(notifyPayload.to).toEqual(["operator@example.com"]);
    expect(notifyPayload.subject).toBe("New pending signup: returning@example.com");
    expect(notifyPayload.text).toContain("returning@example.com started signup");
    expect(db.runs.some((r) => /UPDATE subscribers SET/i.test(r.sql))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not send another confirmation for an active subscriber", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const db = new MockD1();
    db.existingSubscriber = { id: "sub-1", status: "active" };

    const res = await handleSubscribe(
      new Request("https://newsletter.example.com/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "active@example.com", source: "test", website: "" }),
      }),
      envWithDb(db),
    );
    const body = await res.json() as { ok?: boolean; state?: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, state: "active" });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.runs.some((r) => /INSERT INTO verification_tokens/i.test(r.sql))).toBe(false);
    vi.unstubAllGlobals();
  });
});
