import type { Env } from "../types.js";
import { audit } from "../lib/audit.js";
import { sha256Hex, randomTokenHex } from "../lib/crypto.js";
import { confirmOkPage } from "../lib/templates.js";

export async function handleConfirm(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token") ?? "";
  if (!raw || raw.length > 200) {
    return htmlResponse("Invalid link", 400);
  }
  const now = Date.now();
  const tokenHash = await sha256Hex(raw);

  const row = await env.DB.prepare(
    `SELECT vt.id as vt_id, vt.subscriber_id, vt.expires_at, vt.used_at, s.email, s.status
     FROM verification_tokens vt
     JOIN subscribers s ON s.id = vt.subscriber_id
     WHERE vt.token_hash = ? AND vt.type = 'confirm'`,
  )
    .bind(tokenHash)
    .first<{
      vt_id: string;
      subscriber_id: string;
      expires_at: number;
      used_at: number | null;
      email: string;
      status: string;
    }>();

  if (!row || row.used_at !== null) {
    return htmlResponse("This confirmation link is invalid or already used.", 400);
  }
  if (row.expires_at < now) {
    return htmlResponse("This confirmation link has expired.", 400);
  }

  const unsub = randomTokenHex(24);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE verification_tokens SET used_at = ? WHERE id = ?`,
    ).bind(now, row.vt_id),
    env.DB.prepare(
      `UPDATE subscribers SET status = 'active', confirmed_at = ?, unsubscribe_token = ? WHERE id = ?`,
    ).bind(now, unsub, row.subscriber_id),
  ]);

  await audit(env.DB, "subscriber_confirmed", row.subscriber_id, { email: row.email }, now);
  return new Response(confirmOkPage(env), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function htmlResponse(msg: string, status: number): Response {
  const body = `<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem"><p>${msg}</p></body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
