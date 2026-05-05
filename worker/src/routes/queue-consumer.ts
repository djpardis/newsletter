import type { Env, SendMessage } from "../types.js";
import { uuid } from "../lib/crypto.js";
import { sendEmail } from "../lib/resend.js";
import { baseUrl, campaignEmail } from "../lib/templates.js";

/**
 * Processes a batch of send messages from the Cloudflare Queue.
 * Each message contains a campaign_id and subscriber_id.
 * Messages are individually acked/retried so a transient Resend failure
 * only retries the affected subscriber, not the whole batch.
 */
export async function handleSendQueue(
  batch: MessageBatch<SendMessage>,
  env: Env,
): Promise<void> {
  const now = Date.now();

  // Group messages by campaign_id — usually all the same per batch —
  // so we fetch the campaign row once rather than per message.
  const campaignIds = [...new Set(batch.messages.map((m) => m.body.campaign_id))];
  const campaigns = new Map<string, {
    id: string;
    subject: string;
    html_body: string;
    text_body: string;
  }>();

  for (const cid of campaignIds) {
    const row = await env.DB.prepare(
      `SELECT id, subject, html_body, text_body FROM campaigns WHERE id = ?`,
    ).bind(cid).first<{
      id: string;
      subject: string;
      html_body: string;
      text_body: string;
    }>();
    if (row) campaigns.set(cid, row);
  }

  for (const msg of batch.messages) {
    const { campaign_id, subscriber_id } = msg.body;
    const campaign = campaigns.get(campaign_id);

    if (!campaign) {
      // Campaign deleted or never existed — ack to avoid infinite retry.
      msg.ack();
      continue;
    }

    const sub = await env.DB.prepare(
      `SELECT id, email, unsubscribe_token FROM subscribers
       WHERE id = ? AND status = 'active' AND unsubscribe_token IS NOT NULL`,
    ).bind(subscriber_id).first<{
      id: string;
      email: string;
      unsubscribe_token: string;
    }>();

    if (!sub) {
      // Subscriber unsubscribed, bounced, or deleted since enqueue — skip.
      msg.ack();
      continue;
    }

    // Idempotency: skip if already successfully delivered (e.g. queue redelivery
    // after a successful Resend call but before the ack reached the broker).
    const existing = await env.DB.prepare(
      `SELECT id FROM deliveries
       WHERE campaign_id = ? AND subscriber_id = ? AND status = 'sent'`,
    ).bind(campaign_id, subscriber_id).first<{ id: string }>();
    if (existing) {
      msg.ack();
      continue;
    }

    const unsubUrl = `${baseUrl(env)}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`;
    const tpl = campaignEmail(env, campaign.html_body, campaign.text_body, unsubUrl);

    const result = await sendEmail(env, {
      to: sub.email,
      subject: campaign.subject,
      html: tpl.html,
      text: tpl.text,
      unsubscribeUrl: unsubUrl,
    });

    const did = uuid();
    if (result.ok) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO deliveries
           (id, campaign_id, subscriber_id, provider_message_id, status, error, sent_at)
         VALUES (?, ?, ?, ?, 'sent', NULL, ?)`,
      ).bind(did, campaign_id, subscriber_id, result.id, now).run();
      msg.ack();
    } else {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO deliveries
           (id, campaign_id, subscriber_id, provider_message_id, status, error, sent_at)
         VALUES (?, ?, ?, NULL, 'failed', ?, ?)`,
      ).bind(did, campaign_id, subscriber_id, result.error, now).run();
      // Retry the message — Resend failures are often transient.
      msg.retry();
    }
  }
}
