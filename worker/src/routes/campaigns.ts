import type { Env, CampaignKind } from "../types.js";
import { authorizeBearer } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { uuid } from "../lib/crypto.js";
import { sendEmail } from "../lib/resend.js";
import { baseUrl, campaignEmail } from "../lib/templates.js";
import { parseJsonBody } from "../lib/validation.js";

const CHUNK = 12;

function isKind(k: string): k is CampaignKind {
  return k === "new_post" || k === "new_show" || k === "manual";
}

export async function handleCampaignSend(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!authorizeBearer(request, env.ADMIN_BEARER_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const raw = await request.text();
  const body = parseJsonBody(raw);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });

  const now = Date.now();
  let campaignId: string | null =
    typeof body.campaign_id === "string" ? body.campaign_id : null;

  if (!campaignId) {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind : "";
    const htmlBody =
      typeof body.html_body === "string" ? body.html_body : "";
    const textBody =
      typeof body.text_body === "string" ? body.text_body : "";
    if (!slug || !subject || !isKind(kind) || !htmlBody || !textBody) {
      return Response.json({ error: "invalid_payload" }, { status: 400 });
    }
    campaignId = uuid();
    try {
      await env.DB.prepare(
        `INSERT INTO campaigns (id, slug, subject, kind, html_body, text_body, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
        .bind(campaignId, slug.slice(0, 160), subject.slice(0, 500), kind, htmlBody, textBody, now)
        .run();
    } catch {
      return Response.json({ error: "slug_conflict_or_db" }, { status: 409 });
    }
  }

  const campaign = await env.DB.prepare(
    `SELECT id, subject, kind, html_body, text_body FROM campaigns WHERE id = ?`,
  )
    .bind(campaignId)
    .first<{
      id: string;
      subject: string;
      kind: string;
      html_body: string;
      text_body: string;
    }>();

  if (!campaign) return Response.json({ error: "campaign_not_found" }, { status: 404 });

  const subs = await env.DB.prepare(
    `SELECT id, email, unsubscribe_token FROM subscribers WHERE status = 'active' AND unsubscribe_token IS NOT NULL`,
  ).all<{
    id: string;
    email: string;
    unsubscribe_token: string;
  }>();

  const rows = subs.results ?? [];
  let sent = 0;
  let failed = 0;

  const sendOne = async (sub: (typeof rows)[0]) => {
    const unsubUrl = `${baseUrl(env)}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
    const tpl = campaignEmail(
      env,
      campaign.subject,
      campaign.html_body,
      campaign.text_body,
      unsubUrl,
    );
    const r = await sendEmail(env, {
      to: sub.email,
      subject: campaign.subject,
      html: tpl.html,
      text: tpl.text,
      unsubscribeUrl: unsubUrl,
    });
    const did = uuid();
    if (r.ok) {
      sent++;
      await env.DB.prepare(
        `INSERT INTO deliveries (id, campaign_id, subscriber_id, provider_message_id, status, error, sent_at)
         VALUES (?, ?, ?, ?, 'sent', NULL, ?)`,
      )
        .bind(did, campaign.id, sub.id, r.id, now)
        .run();
    } else {
      failed++;
      await env.DB.prepare(
        `INSERT INTO deliveries (id, campaign_id, subscriber_id, provider_message_id, status, error, sent_at)
         VALUES (?, ?, ?, NULL, 'failed', ?, ?)`,
      )
        .bind(did, campaign.id, sub.id, r.error, now)
        .run();
    }
  };

  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    await Promise.all(part.map((s) => sendOne(s)));
  }

  await env.DB.prepare(`UPDATE campaigns SET sent_at = ? WHERE id = ? AND sent_at IS NULL`)
    .bind(now, campaign.id)
    .run();

  await audit(env.DB, "campaign_sent", null, { campaign_id: campaign.id, sent, failed }, now);

  return Response.json({
    ok: true,
    campaign_id: campaign.id,
    recipients: rows.length,
    sent,
    failed,
  });
}
