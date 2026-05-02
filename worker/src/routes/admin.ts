import type { Env } from "../types.js";
import { audit } from "../lib/audit.js";
import { authorizeBearer } from "../lib/auth.js";
import { normalizeEmail, parseJsonBody } from "../lib/validation.js";

export async function handleAdminDelete(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!authorizeBearer(request, env.ADMIN_BEARER_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = parseJsonBody(await request.text());
  const email = normalizeEmail(body?.email);
  if (!email) return Response.json({ error: "invalid_email" }, { status: 400 });

  const sub = await env.DB.prepare(
    `SELECT id FROM subscribers WHERE email = ?`,
  )
    .bind(email)
    .first<{ id: string }>();
  if (!sub) return Response.json({ ok: true, deleted: 0 });

  const now = Date.now();
  const id = sub.id;

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM verification_tokens WHERE subscriber_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM deliveries WHERE subscriber_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM events_audit WHERE subscriber_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM subscribers WHERE id = ?`).bind(id),
  ]);

  await audit(env.DB, "subscriber_deleted", null, { email }, now);
  return Response.json({ ok: true, deleted: 1 });
}
