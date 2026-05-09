import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import { handleCampaignTestSend } from "./campaigns.js";

interface CampaignRow {
  id: string;
  subject: string;
  html_body: string;
  text_body: string;
}

interface SubscriberRow {
  id: string;
  email: string;
  status: string;
  unsubscribe_token: string | null;
}

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
    if (this.sql.includes("FROM campaigns WHERE id = ?")) {
      return (this.db.campaigns.get(String(this.args[0])) ?? null) as T | null;
    }

    if (this.sql.includes("FROM subscribers")) {
      const sub = this.db.subscribers.get(String(this.args[0]));
      if (sub?.status === "active" && sub.unsubscribe_token) {
        return {
          id: sub.id,
          email: sub.email,
          unsubscribe_token: sub.unsubscribe_token,
        } as T;
      }
      return null;
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
  readonly campaigns = new Map<string, CampaignRow>();
  readonly subscribers = new Map<string, SubscriberRow>();
  readonly runs: Array<{ sql: string; args: unknown[] }> = [];

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }
}

function envWithDb(db: MockD1): Env {
  return {
    ADMIN_BEARER_TOKEN: "secret",
    BASE_URL: "https://newsletter.example.com",
    DB: db as unknown as D1Database,
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    RESEND_API_KEY: "resend",
  };
}

function request(body: unknown, token = "secret"): Request {
  return new Request("https://newsletter.example.com/api/campaigns/test-send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function seedCampaign(db: MockD1) {
  db.campaigns.set("campaign-1", {
    id: "campaign-1",
    subject: "Campaign subject",
    html_body: "<p>Hello</p><p>{{unsubscribe_url}}</p>",
    text_body: "Hello\n\n{{unsubscribe_url}}",
  });
}

describe("handleCampaignTestSend", () => {
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
    const db = new MockD1();
    const res = await handleCampaignTestSend(
      request({ campaign_id: "campaign-1", email: "test@example.com" }, "wrong"),
      envWithDb(db),
    );

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads", async () => {
    const db = new MockD1();
    const res = await handleCampaignTestSend(
      request({ campaign_id: "campaign-1", email: "not-email" }),
      envWithDb(db),
    );

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends one test email to an active subscriber with a real unsubscribe URL", async () => {
    const db = new MockD1();
    seedCampaign(db);
    db.subscribers.set("active@example.com", {
      id: "sub-1",
      email: "active@example.com",
      status: "active",
      unsubscribe_token: "real-token",
    });

    const res = await handleCampaignTestSend(
      request({ campaign_id: "campaign-1", email: "active@example.com" }),
      envWithDb(db),
    );
    const body = await res.json() as { unsubscribe: string };

    expect(res.status).toBe(200);
    expect(body.unsubscribe).toBe("real");
    expect(fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(payload.to).toEqual(["active@example.com"]);
    expect(payload.text).toContain("token=real-token");
    expect(payload.html).toContain("token=real-token");
    expect(payload.headers["List-Unsubscribe"]).toContain("token=real-token");
    expect(db.runs.some((r) => /UPDATE campaigns/i.test(r.sql))).toBe(false);
    expect(db.runs.some((r) => /INSERT.*deliveries/is.test(r.sql))).toBe(false);
  });

  it("sends one test email to an arbitrary address with a preview unsubscribe URL", async () => {
    const db = new MockD1();
    seedCampaign(db);

    const res = await handleCampaignTestSend(
      request({ campaign_id: "campaign-1", email: "preview@example.com" }),
      envWithDb(db),
    );
    const body = await res.json() as { unsubscribe: string };

    expect(res.status).toBe(200);
    expect(body.unsubscribe).toBe("preview");
    expect(fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(payload.to).toEqual(["preview@example.com"]);
    expect(payload.text).toContain("token=PREVIEW");
    expect(payload.html).toContain("token=PREVIEW");
    expect(db.runs.some((r) => /UPDATE campaigns/i.test(r.sql))).toBe(false);
    expect(db.runs.some((r) => /INSERT.*deliveries/is.test(r.sql))).toBe(false);
  });
});
