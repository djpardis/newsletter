import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, SendMessage } from "../types.js";
import { sendWelcomeCampaign } from "./welcome.js";

interface Delivery {
  campaign_id: string;
  subscriber_id: string;
  status: string;
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
    if (this.sql.includes("FROM campaigns WHERE slug = ?")) {
      return (this.db.campaigns.get(String(this.args[0])) ?? null) as T | null;
    }
    if (this.sql.includes("FROM deliveries")) {
      const [campaignId, subscriberId] = this.args;
      const hit = this.db.deliveries.find(
        (d) => d.campaign_id === campaignId && d.subscriber_id === subscriberId && d.status === "sent",
      );
      return (hit ? { id: "d1" } : null) as T | null;
    }
    if (this.sql.includes("FROM subscribers")) {
      return (this.db.subscribers.get(String(this.args[0])) ?? null) as T | null;
    }
    return null;
  }

  async run(): Promise<D1Result> {
    if (this.sql.includes("INSERT OR IGNORE INTO deliveries")) {
      this.db.deliveries.push({
        campaign_id: String(this.args[1]),
        subscriber_id: String(this.args[2]),
        status: String(this.args[4]),
      });
    }
    if (this.sql.includes("INSERT INTO events_audit")) {
      this.db.audits.push(String(this.args[2]));
    }
    return { results: [], success: true, meta: {} as D1Result["meta"] };
  }
}

class MockD1 {
  readonly campaigns = new Map<string, { id: string; subject: string; html_body: string; text_body: string }>();
  readonly subscribers = new Map<string, { id: string; email: string; unsubscribe_token: string }>();
  readonly deliveries: Delivery[] = [];
  readonly audits: string[] = [];

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }
}

function makeEnv(db: MockD1, overrides: Partial<Env> = {}): Env {
  return {
    ADMIN_BEARER_TOKEN: "secret",
    BASE_URL: "https://newsletter.example.com",
    DB: db as unknown as D1Database,
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    RESEND_API_KEY: "resend",
    WELCOME_CAMPAIGN_SLUG: "welcome",
    ...overrides,
  };
}

function seed(db: MockD1) {
  db.campaigns.set("welcome", {
    id: "c-welcome",
    subject: "Welcome",
    html_body: "<p>Hello</p>",
    text_body: "Hello",
  });
  db.subscribers.set("s1", { id: "s1", email: "reader@example.com", unsubscribe_token: "unsub" });
}

describe("sendWelcomeCampaign", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => Response.json({ id: "msg-1" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when WELCOME_CAMPAIGN_SLUG is unset", async () => {
    const db = new MockD1();
    seed(db);
    const result = await sendWelcomeCampaign(makeEnv(db, { WELCOME_CAMPAIGN_SLUG: undefined }), "s1", 1);
    expect(result).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a missing campaign without sending", async () => {
    const db = new MockD1();
    const result = await sendWelcomeCampaign(makeEnv(db), "s1", 1);
    expect(result).toBe("campaign_not_found");
    expect(db.audits).toContain("welcome_campaign_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enqueues the welcome campaign when a send queue is bound", async () => {
    const db = new MockD1();
    seed(db);
    const sent: SendMessage[] = [];
    const queue = { send: async (body: SendMessage) => void sent.push(body) } as unknown as Queue<SendMessage>;
    const result = await sendWelcomeCampaign(makeEnv(db, { SEND_QUEUE: queue }), "s1", 1);
    expect(result).toBe("queued");
    expect(sent).toEqual([{ campaign_id: "c-welcome", subscriber_id: "s1" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends inline and records a delivery without a queue", async () => {
    const db = new MockD1();
    seed(db);
    const result = await sendWelcomeCampaign(makeEnv(db), "s1", 1);
    expect(result).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload.to).toEqual(["reader@example.com"]);
    expect(payload.subject).toBe("Welcome");
    expect(db.deliveries).toEqual([{ campaign_id: "c-welcome", subscriber_id: "s1", status: "sent" }]);
  });

  it("does not resend to a subscriber who already received it", async () => {
    const db = new MockD1();
    seed(db);
    db.deliveries.push({ campaign_id: "c-welcome", subscriber_id: "s1", status: "sent" });
    const result = await sendWelcomeCampaign(makeEnv(db), "s1", 1);
    expect(result).toBe("already_sent");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
