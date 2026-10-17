import type { Env } from "../types.js";
import { audit } from "../lib/audit.js";
import { sha256Hex, randomTokenHex, uuid } from "../lib/crypto.js";
import { sendEmail } from "../lib/resend.js";
import { checkSubscribeRateLimit } from "../lib/rate-limit.js";
import { hashMeta } from "../lib/request-meta.js";
import { confirmEmail, baseUrl, siteUrl } from "../lib/templates.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import {
  isHoneypotTriggered,
  normalizeEmail,
  parseJsonBody,
  safeMetadata,
} from "../lib/validation.js";

const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;

async function rotateConfirmToken(
  db: D1Database,
  subscriberId: string,
  tokenHash: string,
  now: number,
): Promise<void> {
  await db.batch([
    db.prepare(
      `UPDATE verification_tokens SET used_at = ?
       WHERE subscriber_id = ? AND type = 'confirm' AND used_at IS NULL`,
    ).bind(now, subscriberId),
    db.prepare(
      `INSERT INTO verification_tokens
         (id, subscriber_id, token_hash, type, expires_at, used_at)
       VALUES (?, ?, ?, 'confirm', ?, NULL)`,
    ).bind(uuid(), subscriberId, tokenHash, now + CONFIRM_TTL_MS),
  ]);
}

async function sendConfirmEmail(
  env: Env,
  email: string,
  plainToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const confirmUrl = `${baseUrl(env)}/api/confirm?token=${encodeURIComponent(plainToken)}`;
  const tpl = confirmEmail(env, confirmUrl);
  return sendEmail(env, {
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    transactional: true,
  });
}

function notifyNewSubscriber(
  env: Env,
  email: string,
  source: string | null,
): Promise<void> {
  if (!env.NOTIFY_EMAIL) return Promise.resolve();
  const siteName = env.SITE_NAME ?? "Newsletter";
  const website = siteUrl(env);
  const signupSource = source || "unknown";
  const htmlSiteName = escapeHtml(siteName);
  const htmlEmail = escapeHtml(email);
  const htmlWebsite = escapeHtml(website);
  const htmlSource = escapeHtml(signupSource);
  return sendEmail(env, {
    to: env.NOTIFY_EMAIL,
    subject: `New pending signup for ${siteName}: ${email}`,
    text: [
      `${email} started signup for ${siteName} and was sent a confirmation email.`,
      "",
      `Website: ${website}`,
      `Source: ${signupSource}`,
    ].join("\n"),
    html: [
      `<p>${htmlEmail} started signup for ${htmlSiteName} and was sent a confirmation email.</p>`,
      `<p>Website: <a href="${htmlWebsite}">${htmlWebsite}</a><br>Source: ${htmlSource}</p>`,
    ].join("\n"),
    transactional: true,
  }).then((result) => {
    if (!result.ok) console.error("notify_email_failed:", result.error);
  }).catch(console.error);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailFailureResponse(detail: string): Response {
  return Response.json(
    { error: "email_send_failed", detail },
    { status: 502 },
  );
}

export async function handleSubscribe(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  const now = Date.now();
  const text = await request.text();
  const body = parseJsonBody(text) ?? {};
  if (isHoneypotTriggered(body)) {
    return Response.json({ ok: true }, { status: 200 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  const meta = await hashMeta(request);
  const rlKey =
    meta.ipHash ?? (await sha256Hex(`v1|anon|${request.cf?.colo ?? "na"}`));
  const rl = await checkSubscribeRateLimit(env.SUBSCRIBE_RATE_LIMITER, env.DB, `sub:${rlKey}`, now);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const turnOk = await verifyTurnstile(
    env,
    typeof body.turnstile_token === "string" ? body.turnstile_token : undefined,
    request.headers.get("CF-Connecting-IP"),
  );
  if (!turnOk) {
    return Response.json({ error: "turnstile_failed" }, { status: 400 });
  }

  const source =
    typeof body.source === "string" ? body.source.slice(0, 120) : null;
  const metadata = safeMetadata(body.metadata);

  const existing = await env.DB.prepare(
    `SELECT id, status FROM subscribers WHERE email = ?`,
  )
    .bind(email)
    .first<{ id: string; status: string }>();

  if (existing?.status === "active") {
    audit(env.DB, "subscribe_idempotent_active", existing.id, { email }, now).catch(console.error);
    return Response.json({ ok: true, state: "active" });
  }

  const plainToken = randomTokenHex(32);
  const tokenHash = await sha256Hex(plainToken);

  let subscriberId: string;
  let auditEvent: string;
  let auditPayload: Record<string, unknown> | null;
  let notifySubscriberEmail: string | null = null;

  if (existing) {
    subscriberId = existing.id;
    if (existing.status === "pending") {
      auditEvent = "subscribe_resend_confirm";
      auditPayload = null;
    } else {
      await env.DB.prepare(
        `UPDATE subscribers SET
           status = 'pending',
           confirmed_at = NULL,
           unsubscribed_at = NULL,
           unsubscribe_token = NULL,
           source = COALESCE(?, source),
           metadata_json = COALESCE(?, metadata_json),
           ip_hash = COALESCE(?, ip_hash),
           user_agent_hash = COALESCE(?, user_agent_hash)
         WHERE id = ?`,
      )
        .bind(source, metadata, meta.ipHash, meta.uaHash, existing.id)
        .run();
      auditEvent = "subscribe_reactivated";
      auditPayload = { from: existing.status };
      notifySubscriberEmail = email;
    }
  } else {
    subscriberId = uuid();
    await env.DB.prepare(
      `INSERT INTO subscribers
         (id, email, status, created_at, confirmed_at, unsubscribed_at,
          source, ip_hash, user_agent_hash, metadata_json, unsubscribe_token)
       VALUES (?, ?, 'pending', ?, NULL, NULL, ?, ?, ?, ?, NULL)`,
    )
      .bind(subscriberId, email, now, source, meta.ipHash, meta.uaHash, metadata)
      .run();
    auditEvent = "subscribe_created";
    auditPayload = null;
    notifySubscriberEmail = email;
  }

  await rotateConfirmToken(env.DB, subscriberId, tokenHash, now);
  const sent = await sendConfirmEmail(env, email, plainToken);
  if (!sent.ok) return emailFailureResponse(sent.error);

  if (notifySubscriberEmail) {
    const notify = notifyNewSubscriber(env, notifySubscriberEmail, source);
    if (ctx) ctx.waitUntil(notify);
    else await notify;
  }

  audit(env.DB, auditEvent, subscriberId, auditPayload, now).catch(console.error);
  return Response.json({ ok: true, state: "pending" });
}
