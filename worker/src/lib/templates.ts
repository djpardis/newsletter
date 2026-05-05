import type { Env } from "../types.js";

function brandName(env: Env): string {
  return env.SITE_NAME ?? "Newsletter";
}

/** Worker URL (used for confirm/unsubscribe links). */
export function baseUrl(env: Env): string {
  return env.BASE_URL.replace(/\/$/, "");
}

/** Public website URL (used for email footer "site" link). Falls back to BASE_URL. */
export function siteUrl(env: Env): string {
  return (env.SITE_URL ?? env.BASE_URL).replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function confirmEmail(
  env: Env,
  confirmUrl: string,
): { subject: string; html: string; text: string } {
  const brand = brandName(env);
  const subject = `Confirm your subscription to ${brand}`;
  const html = `<!DOCTYPE html><html><body>
  <p>Thank you for subscribing to ${escapeHtml(brand)}.</p>
  <p><a href="${confirmUrl}">Confirm</a> your email.</p>
  <p>If you did not subscribe, ignore this message.</p>
  </body></html>`;
  const text = `Thank you for subscribing to ${brand}.\n\nConfirm your email: ${confirmUrl}\n\nIf you did not subscribe, ignore this message.`;
  return { subject, html, text };
}

function okPageShell(title: string, heading: string, body: string, _env: Env): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;line-height:1.6;margin:0;padding:3rem 1.5rem;background:#fff;color:#111}main{max-width:36rem;margin:auto}h1{font-size:1.3rem;font-weight:600;margin:0 0 .5rem}p{margin:.5rem 0;color:#444}a{color:inherit}</style>
  </head>
  <body><main>
  <h1>${escapeHtml(heading)}</h1>
  <p>${body}</p>
  </main></body></html>`;
}

export function confirmOkPage(env: Env): string {
  const site = siteUrl(env);
  const name = escapeHtml(brandName(env));
  return okPageShell("Confirmed!", "Confirmed!", `Thank you for subscribing to <a href="${site}">${name}</a>.`, env);
}

export function unsubscribedPage(env: Env): string {
  const site = siteUrl(env);
  const name = escapeHtml(brandName(env));
  return okPageShell("Unsubscribed!", "You're unsubscribed!", `You won't receive any further emails from <a href="${site}">${name}</a>.`, env);
}

export function campaignEmail(
  _env: Env,
  htmlBody: string,
  textBody: string,
  unsubscribeUrl: string,
): { html: string; text: string } {
  const html = htmlBody
    .replaceAll("{{unsubscribe_url}}", unsubscribeUrl)
    .replaceAll("%7B%7Bunsubscribe_url%7D%7D", unsubscribeUrl);
  const text = textBody.replaceAll("{{unsubscribe_url}}", unsubscribeUrl);
  return { html, text };
}
