import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { Env, SendMessage } from "../types.js";
import { sqliteD1 } from "../test/sqlite-d1.js";
import { handleApprovePage, handleApproveSend, handleRequestApproval } from "./approval.js";

const BASE = "https://newsletter.example.com";

function makeEnv(d1: D1Database, queue: SendMessage[]): Env {
  return {
    ADMIN_BEARER_TOKEN: "secret",
    BASE_URL: BASE,
    DB: d1,
    FROM_EMAIL: "Newsletter <newsletter@example.com>",
    REPLY_TO: "operator@example.com",
    RESEND_API_KEY: "resend",
    SEND_QUEUE: {
      sendBatch: async (messages: { body: SendMessage }[]) => {
        queue.push(...messages.map((m) => m.body));
      },
    } as unknown as Queue<SendMessage>,
  };
}

function addSubscriber(db: DatabaseSync, id: string, email: string, status = "active") {
  db.prepare(
    `INSERT INTO subscribers (id, email, status, created_at, unsubscribe_token) VALUES (?, ?, ?, 0, ?)`,
  ).run(id, email, status, `unsub-${id}`);
}

const payload = {
  slug: "first-post",
  subject: "First post",
  kind: "new_post",
  html_body: "<!DOCTYPE html><html><body><p>Hello</p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a></body></html>",
  text_body: "Hello\n\nUnsubscribe: {{unsubscribe_url}}",
};

function requestApproval(body: Record<string, unknown>, token = "secret") {
  return new Request(`${BASE}/api/campaigns/request-approval`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function approvePost(token: string) {
  const form = new FormData();
  form.set("token", token);
  return new Request(`${BASE}/api/campaigns/approve`, { method: "POST", body: form });
}

describe("campaign approval", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sentEmails: { to: string[]; subject: string; html: string; text: string }[];
  let db: DatabaseSync;
  let env: Env;
  let queue: SendMessage[];

  beforeEach(() => {
    sentEmails = [];
    fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      sentEmails.push(JSON.parse(String(init.body)));
      return Response.json({ id: `email-${sentEmails.length}` });
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = sqliteD1();
    db = store.db;
    queue = [];
    env = makeEnv(store.d1, queue);
    addSubscriber(db, "s1", "reader@example.com");
    addSubscriber(db, "s2", "other@example.com");
    addSubscriber(db, "s3", "gone@example.com", "unsubscribed");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function approvalToken(): string {
    const url = sentEmails.at(-1)!.text.match(/approve\?token=([0-9a-f]{64})/)![1];
    return url;
  }

  it("rejects requests without the admin token", async () => {
    const res = await handleRequestApproval(requestApproval(payload, "wrong"), env);
    expect(res.status).toBe(401);
  });

  it("creates the campaign and emails a review copy to REPLY_TO", async () => {
    const res = await handleRequestApproval(requestApproval(payload), env);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ ok: true, status: "requested", email: "operator@example.com", recipients: 2 });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual(["operator@example.com"]);
    expect(sentEmails[0].subject).toBe("Review: First post");
    expect(sentEmails[0].html).toContain("Review and send it to 2 subscribers");
    expect(sentEmails[0].html.indexOf("Review copy")).toBeLessThan(sentEmails[0].html.indexOf("Hello"));
    expect(sentEmails[0].html).toContain("token=PREVIEW");
    expect(queue).toHaveLength(0);
    expect(db.prepare("SELECT sent_at FROM campaigns WHERE slug = 'first-post'").get()).toEqual({ sent_at: null });
  });

  it("skips a slug that already has a campaign unless refresh is set", async () => {
    await handleRequestApproval(requestApproval(payload), env);
    const first = approvalToken();

    const again = (await (await handleRequestApproval(requestApproval(payload), env)).json()) as Record<string, unknown>;
    expect(again.status).toBe("already_requested");
    expect(sentEmails).toHaveLength(1);

    const refreshed = (await (
      await handleRequestApproval(requestApproval({ ...payload, subject: "First post, edited", refresh: true }), env)
    ).json()) as Record<string, unknown>;
    expect(refreshed.status).toBe("requested");
    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[1].subject).toBe("Review: First post, edited");

    const stale = await handleApproveSend(approvePost(first), env);
    expect(stale.status).toBe(410);
    expect(queue).toHaveLength(0);
  });

  it("shows a confirmation page without sending anything", async () => {
    await handleRequestApproval(requestApproval(payload), env);
    const res = await handleApprovePage(new Request(`${BASE}/api/campaigns/approve?token=${approvalToken()}`), env);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("Send to 2 subscribers");
    expect(html).toContain('method="post"');
    expect(queue).toHaveLength(0);
    expect(db.prepare("SELECT used_at FROM campaign_approvals").get()).toEqual({ used_at: null });
  });

  it("sends once when the reviewer presses send", async () => {
    await handleRequestApproval(requestApproval(payload), env);
    const token = approvalToken();

    const res = await handleApproveSend(approvePost(token), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("on its way to 2 subscribers");
    expect(queue.map((m) => m.subscriber_id).sort()).toEqual(["s1", "s2"]);

    const again = await handleApproveSend(approvePost(token), env);
    expect(again.status).toBe(410);
    expect(await again.text()).toContain("Already sent");
    expect(queue).toHaveLength(2);

    const after = (await (await handleRequestApproval(requestApproval(payload), env)).json()) as Record<string, unknown>;
    expect(after.status).toBe("already_sent");
  });

  it("refuses expired and unknown links", async () => {
    await handleRequestApproval(requestApproval(payload), env);
    const token = approvalToken();
    db.prepare("UPDATE campaign_approvals SET expires_at = 1").run();

    expect((await handleApproveSend(approvePost(token), env)).status).toBe(410);
    expect((await handleApproveSend(approvePost("0".repeat(64)), env)).status).toBe(404);
    expect((await handleApprovePage(new Request(`${BASE}/api/campaigns/approve?token=nope`), env)).status).toBe(404);
    expect(queue).toHaveLength(0);
  });
});
