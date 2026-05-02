import type { Env } from "../types.js";
import { audit } from "../lib/audit.js";
import { uuid } from "../lib/crypto.js";
import { verifySvixSignature } from "../lib/svix.js";

interface ResendEvent {
  type?: string;
  data?: { email_id?: string; to?: string | string[] };
}

function targetEmail(evt: ResendEvent): string | null {
  const to = evt.data?.to;
  if (Array.isArray(to)) return to[0] ?? null;
  if (typeof to === "string") return to;
  return null;
}

function statusForEvent(type: string): "bounced" | "complained" | null {
  if (type === "email.bounced" || type === "email.failed") return "bounced";
  if (type === "email.complained") return "complained";
  return null;
}

export async function handleResendWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verify = await verifySvixSignature({
    secret: env.RESEND_WEBHOOK_SECRET,
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signatureHeader: request.headers.get("svix-signature"),
    rawBody,
  });
  if (!verify.ok) {
    return Response.json({ error: verify.reason }, { status: 401 });
  }

  let payload: ResendEvent;
  try {
    payload = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventId = request.headers.get("svix-id") ?? uuid();
  const eventType = payload.type ?? "unknown";
  const now = Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO webhook_events
         (id, source, event_id, event_type, payload_json, created_at)
       VALUES (?, 'resend', ?, ?, ?, ?)`,
    )
      .bind(uuid(), eventId, eventType, rawBody.slice(0, 4000), now)
      .run();
  } catch {
    return Response.json({ ok: true, duplicate: true });
  }

  const newStatus = statusForEvent(eventType);
  const email = targetEmail(payload);
  if (newStatus && email) {
    const sub = await env.DB.prepare(
      `SELECT id, status FROM subscribers WHERE email = ?`,
    )
      .bind(email.toLowerCase())
      .first<{ id: string; status: string }>();
    if (sub && sub.status !== newStatus && sub.status !== "unsubscribed") {
      await env.DB.prepare(
        `UPDATE subscribers
           SET status = ?, unsubscribe_token = NULL, unsubscribed_at = ?
         WHERE id = ?`,
      )
        .bind(newStatus, now, sub.id)
        .run();
      await audit(env.DB, `webhook_${newStatus}`, sub.id, { email }, now);
    }
  }

  return Response.json({ ok: true });
}
