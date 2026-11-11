import type { Env } from "../types.js";
import { authorizeBearer } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { randomTokenHex, sha256Hex, uuid } from "../lib/crypto.js";
import { sendEmail } from "../lib/resend.js";
import { baseUrl, campaignEmail, escapeHtml, pageShell } from "../lib/templates.js";
import { normalizeEmail, parseJsonBody } from "../lib/validation.js";
import { deliverCampaign, isKind, pendingRecipients } from "./campaigns.js";

export const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CampaignRow {
  id: string;
  slug: string;
  subject: string;
  html_body: string;
  text_body: string;
  sent_at: number | null;
}

function subscribers(n: number): string {
  return `${n} subscriber${n === 1 ? "" : "s"}`;
}

function page(status: number, heading: string, bodyHtml: string): Response {
  return new Response(pageShell(heading, heading, bodyHtml), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

function withReviewBanner(html: string, approveUrl: string, recipients: number): string {
  const banner =
    `<div style="border:1px solid #ddd;border-radius:8px;padding:12px 16px;margin:0 0 24px;` +
    `font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111;background:#f6f6f6">` +
    `<strong>Review copy.</strong> This email has not been sent to subscribers. ` +
    `<a href="${approveUrl}">Review and send it to ${subscribers(recipients)}</a>. ` +
    `The link works once and expires in 7 days.</div>`;
  const bodyTag = html.match(/<body[^>]*>/i);
  if (!bodyTag || bodyTag.index === undefined) return banner + html;
  const at = bodyTag.index + bodyTag[0].length;
  return html.slice(0, at) + banner + html.slice(at);
}

/**
 * Create or reuse an unsent campaign and email the reviewer a copy with a
 * one-time link that sends it to every active subscriber.
 *
 * Body: { slug, subject, kind, html_body, text_body } or { campaign_id },
 * plus optional { email, refresh }. An existing slug is left alone unless
 * refresh is true, so callers can request approval for every post on each
 * deploy without repeating review emails.
 */
export async function handleRequestApproval(request: Request, env: Env): Promise<Response> {
  if (!authorizeBearer(request, env.ADMIN_BEARER_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = parseJsonBody(await request.text());
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const now = Date.now();
  const refresh = body.refresh === true;
  let campaign: CampaignRow | null = null;

  if (typeof body.campaign_id === "string") {
    campaign = await env.DB.prepare(
      `SELECT id, slug, subject, html_body, text_body, sent_at FROM campaigns WHERE id = ?`,
    ).bind(body.campaign_id).first<CampaignRow>();
    if (!campaign) return Response.json({ error: "campaign_not_found" }, { status: 404 });
  } else {
    const slug = typeof body.slug === "string" ? body.slug.trim().slice(0, 160) : "";
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 500) : "";
    const kind = typeof body.kind === "string" ? body.kind : "";
    const html = typeof body.html_body === "string" ? body.html_body : "";
    const text = typeof body.text_body === "string" ? body.text_body : "";
    if (!slug || !subject || !isKind(kind) || !html || !text) {
      return Response.json({ error: "invalid_payload" }, { status: 400 });
    }

    const existing = await env.DB.prepare(
      `SELECT id, slug, subject, html_body, text_body, sent_at FROM campaigns WHERE slug = ?`,
    ).bind(slug).first<CampaignRow>();

    if (existing?.sent_at) {
      return Response.json({ ok: true, campaign_id: existing.id, status: "already_sent" });
    }
    if (existing && !refresh) {
      return Response.json({ ok: true, campaign_id: existing.id, status: "already_requested" });
    }
    if (existing) {
      await env.DB.prepare(
        `UPDATE campaigns SET subject = ?, kind = ?, html_body = ?, text_body = ? WHERE id = ? AND sent_at IS NULL`,
      ).bind(subject, kind, html, text, existing.id).run();
      campaign = { ...existing, subject, html_body: html, text_body: text };
    } else {
      const id = uuid();
      await env.DB.prepare(
        `INSERT INTO campaigns (id, slug, subject, kind, html_body, text_body, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).bind(id, slug, subject, kind, html, text, now).run();
      campaign = { id, slug, subject, html_body: html, text_body: text, sent_at: null };
    }
  }

  if (campaign.sent_at) {
    return Response.json({ ok: true, campaign_id: campaign.id, status: "already_sent" });
  }

  const reviewer = normalizeEmail(body.email) ?? normalizeEmail(env.REVIEW_EMAIL ?? env.REPLY_TO);
  if (!reviewer) return Response.json({ error: "no_reviewer" }, { status: 400 });

  const token = randomTokenHex(32);
  await env.DB.prepare(
    `UPDATE campaign_approvals SET used_at = ? WHERE campaign_id = ? AND used_at IS NULL`,
  ).bind(now, campaign.id).run();
  await env.DB.prepare(
    `INSERT INTO campaign_approvals (id, campaign_id, token_hash, email, created_at, expires_at, used_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).bind(uuid(), campaign.id, await sha256Hex(token), reviewer, now, now + APPROVAL_TTL_MS).run();

  const recipients = (await pendingRecipients(env, campaign.id)).length;
  const approveUrl = `${baseUrl(env)}/api/campaigns/approve?token=${token}`;
  const tpl = campaignEmail(env, campaign.html_body, campaign.text_body, `${baseUrl(env)}/api/unsubscribe?token=PREVIEW`);
  const sent = await sendEmail(env, {
    to: reviewer,
    subject: `Review: ${campaign.subject}`,
    html: withReviewBanner(tpl.html, approveUrl, recipients),
    text:
      `Review copy. This email has not been sent to subscribers.\n` +
      `Review and send it to ${subscribers(recipients)}: ${approveUrl}\n` +
      `The link works once and expires in 7 days.\n\n----\n\n${tpl.text}`,
    transactional: true,
  });
  if (!sent.ok) {
    return Response.json({ error: "email_send_failed", detail: sent.error }, { status: 502 });
  }

  await audit(env.DB, "campaign_approval_requested", null, {
    campaign_id: campaign.id,
    email: reviewer,
    recipients,
  }, now);

  return Response.json({
    ok: true,
    campaign_id: campaign.id,
    status: "requested",
    email: reviewer,
    recipients,
  });
}

async function findApproval(env: Env, token: string, now: number) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT a.id AS approval_id, a.expires_at, a.used_at,
            c.id, c.slug, c.subject, c.html_body, c.text_body, c.sent_at
     FROM campaign_approvals a JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.token_hash = ?`,
  ).bind(await sha256Hex(token)).first<CampaignRow & { approval_id: string; expires_at: number; used_at: number | null }>();
  if (!row) return null;
  return { row, usable: !row.used_at && row.expires_at > now && !row.sent_at };
}

function unusablePage(row: CampaignRow & { used_at: number | null }): Response {
  if (row.sent_at) {
    return page(410, "Already sent", `<p>${escapeHtml(row.subject)} has already been sent.</p>`);
  }
  return page(410, "Link expired", "<p>This review link has been used or has expired. Request a new review email to send this campaign.</p>");
}

/** GET: show what will be sent. Opening the link never sends anything. */
export async function handleApprovePage(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const found = await findApproval(env, token, Date.now());
  if (!found) return page(404, "Link not found", "<p>This review link is not valid.</p>");
  if (!found.usable) return unusablePage(found.row);

  const recipients = (await pendingRecipients(env, found.row.id)).length;
  return page(
    200,
    "Send this email?",
    `<p><strong>${escapeHtml(found.row.subject)}</strong> will go to ${subscribers(recipients)}.</p>` +
      `<form method="post" action="${baseUrl(env)}/api/campaigns/approve">` +
      `<input type="hidden" name="token" value="${token}">` +
      `<button type="submit">Send to ${subscribers(recipients)}</button></form>`,
  );
}

/** POST: claim the one-time token and send the campaign. */
export async function handleApproveSend(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const now = Date.now();
  const found = await findApproval(env, token, now);
  if (!found) return page(404, "Link not found", "<p>This review link is not valid.</p>");
  if (!found.usable) return unusablePage(found.row);

  const claimed = await env.DB.prepare(
    `UPDATE campaign_approvals SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
  ).bind(now, found.row.approval_id, now).run();
  if (!claimed.meta?.changes) return unusablePage({ ...found.row, used_at: now });

  const result = await deliverCampaign(env, found.row, now);
  const count = "queued" in result ? result.queued : result.sent;
  await audit(env.DB, "campaign_approved", null, { campaign_id: found.row.id, recipients: count }, now);
  return page(200, "Sent", `<p>${escapeHtml(found.row.subject)} is on its way to ${subscribers(count)}.</p>`);
}
