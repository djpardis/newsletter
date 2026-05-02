import type { Env } from "../types.js";
import { audit } from "../lib/audit.js";
import { unsubscribedPage } from "../lib/templates.js";

function extractToken(url: URL): string | null {
  const q = url.searchParams.get("token");
  if (q) return q;
  return null;
}

async function parsePostToken(request: Request): Promise<string | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const p = new URLSearchParams(text);
    if (p.get("List-Unsubscribe") === "One-Click") {
      return new URL(request.url).searchParams.get("token");
    }
  }
  return new URL(request.url).searchParams.get("token");
}

export async function handleUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  let token: string | null = null;
  if (request.method === "GET") token = extractToken(url);
  else if (request.method === "POST") token = await parsePostToken(request);
  if (!token || token.length > 200) {
    return htmlResponse("Invalid unsubscribe link.", 400);
  }
  const now = Date.now();

  const row = await env.DB.prepare(
    `SELECT id, email FROM subscribers WHERE unsubscribe_token = ? AND status = 'active'`,
  )
    .bind(token)
    .first<{ id: string; email: string }>();

  if (!row) {
    return new Response(unsubscribedPage(env), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  await env.DB.prepare(
    `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?, unsubscribe_token = NULL WHERE id = ?`,
  )
    .bind(now, row.id)
    .run();
  await audit(env.DB, "subscriber_unsubscribed", row.id, { email: row.email }, now);

  return new Response(unsubscribedPage(env), {
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
