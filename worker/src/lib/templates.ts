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

export function escapeHtml(s: string): string {
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
  const subject = env.CONFIRM_EMAIL_SUBJECT ?? `Confirm your subscription to ${brand}`;
  const html = `<!DOCTYPE html><html><body>
  <p>Thank you for subscribing to ${escapeHtml(brand)}.</p>
  <p><a href="${confirmUrl}">Confirm</a> your email.</p>
  <p>If you did not subscribe, ignore this message.</p>
  </body></html>`;
  const text = `Thank you for subscribing to ${brand}.\n\nConfirm your email: ${confirmUrl}\n\nIf you did not subscribe, ignore this message.`;
  return { subject, html, text };
}

/** Minimal standalone page. `bodyHtml` is inserted as is, so escape any user values first. */
export function pageShell(title: string, heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
  <style>*{box-sizing:border-box}html{font-size:16px}body{font-family:system-ui,sans-serif;line-height:1.6;margin:0;padding:clamp(1.5rem,7vw,3rem) 1rem;background:#fff;color:#111;-webkit-text-size-adjust:100%}main{width:min(100%,36rem);margin:0 auto}h1{font-size:clamp(1.5rem,7vw,2rem);line-height:1.2;font-weight:600;margin:0 0 .75rem}p{font-size:clamp(1rem,4.5vw,1.125rem);margin:.5rem 0;color:#444}a{color:inherit;overflow-wrap:anywhere}button{font:inherit;font-weight:600;margin-top:1rem;padding:.75rem 1.25rem;min-height:44px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer}</style>
  </head>
  <body><main>
  <h1>${escapeHtml(heading)}</h1>
  ${bodyHtml}
  </main></body></html>`;
}

function okPageShell(title: string, heading: string, body: string, _env: Env): string {
  return pageShell(title, heading, `<p>${body}</p>`);
}

export function confirmOkPage(env: Env): string {
  const site = siteUrl(env);
  const name = escapeHtml(brandName(env));
  const heading = env.CONFIRMED_PAGE_HEADING ?? "Confirmed";
  return okPageShell(heading, heading, `Thank you for subscribing to <a href="${site}">${name}</a>.`, env);
}

export function unsubscribedPage(env: Env): string {
  const site = siteUrl(env);
  const name = escapeHtml(brandName(env));
  return okPageShell("Unsubscribed", "Unsubscribed", `You won't receive any further emails from <a href="${site}">${name}</a>.`, env);
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
