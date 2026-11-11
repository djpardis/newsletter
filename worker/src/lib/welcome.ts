import type { Env } from "../types.js";
import { audit } from "./audit.js";
import { uuid } from "./crypto.js";
import { sendEmail } from "./resend.js";
import { baseUrl, campaignEmail } from "./templates.js";

export type WelcomeResult =
  | "disabled"
  | "campaign_not_found"
  | "already_sent"
  | "queued"
  | "sent"
  | "failed";

/**
 * Sends the campaign named by WELCOME_CAMPAIGN_SLUG to a subscriber who just
 * confirmed. Uses the send queue when it is bound, so retries and delivery
 * rows match regular campaign sends. A subscriber who already has a sent
 * delivery for the welcome campaign (for example after re-subscribing) does
 * not receive it again.
 */
export async function sendWelcomeCampaign(
  env: Env,
  subscriberId: string,
  now: number,
): Promise<WelcomeResult> {
  const slug = env.WELCOME_CAMPAIGN_SLUG?.trim();
  if (!slug) return "disabled";

  const campaign = await env.DB.prepare(
    `SELECT id, subject, html_body, text_body FROM campaigns WHERE slug = ?`,
  )
    .bind(slug)
    .first<{ id: string; subject: string; html_body: string; text_body: string }>();

  if (!campaign) {
    console.warn(`welcome campaign "${slug}" not found`);
    await audit(env.DB, "welcome_campaign_missing", subscriberId, { slug }, now);
    return "campaign_not_found";
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM deliveries
     WHERE campaign_id = ? AND subscriber_id = ? AND status = 'sent'`,
  )
    .bind(campaign.id, subscriberId)
    .first<{ id: string }>();
  if (existing) return "already_sent";

  if (env.SEND_QUEUE) {
    await env.SEND_QUEUE.send({ campaign_id: campaign.id, subscriber_id: subscriberId });
    await audit(env.DB, "welcome_enqueued", subscriberId, { campaign_id: campaign.id }, now);
    return "queued";
  }

  const sub = await env.DB.prepare(
    `SELECT id, email, unsubscribe_token FROM subscribers
     WHERE id = ? AND status = 'active' AND unsubscribe_token IS NOT NULL`,
  )
    .bind(subscriberId)
    .first<{ id: string; email: string; unsubscribe_token: string }>();
  if (!sub) return "failed";

  const unsubUrl = `${baseUrl(env)}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
  const tpl = campaignEmail(env, campaign.html_body, campaign.text_body, unsubUrl);
  const result = await sendEmail(env, {
    to: sub.email,
    subject: campaign.subject,
    html: tpl.html,
    text: tpl.text,
    unsubscribeUrl: unsubUrl,
  });

  await env.DB.prepare(
    `INSERT OR IGNORE INTO deliveries
       (id, campaign_id, subscriber_id, provider_message_id, status, error, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      uuid(),
      campaign.id,
      sub.id,
      result.ok ? result.id : null,
      result.ok ? "sent" : "failed",
      result.ok ? null : result.error,
      now,
    )
    .run();

  return result.ok ? "sent" : "failed";
}
