import type { Env } from "../types.js";

function brandName(env: Env): string {
  return env.SITE_NAME ?? "Newsletter";
}

/** Hostname shown to subscribers ("you signed up at <host>"). Prefers SITE_URL. */
function siteHost(env: Env): string {
  const source = env.SITE_URL ?? env.BASE_URL;
  try {
    return new URL(source).hostname;
  } catch {
    return "our website";
  }
}

/** Worker URL (used for confirm/unsubscribe links). */
export function baseUrl(env: Env): string {
  return env.BASE_URL.replace(/\/$/, "");
}

/** Public website URL (used for email footer "site" link). Falls back to BASE_URL. */
export function siteUrl(env: Env): string {
  return (env.SITE_URL ?? env.BASE_URL).replace(/\/$/, "");
}

/** True when COMPANY_ADDRESS is a non-empty string. */
function hasAddress(env: Env): boolean {
  return typeof env.COMPANY_ADDRESS === "string" && env.COMPANY_ADDRESS.length > 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function footerBlock(env: Env, unsubscribeUrl: string): string {
  const host = siteHost(env);
  const addressLine = hasAddress(env)
    ? `<br/>\n    ${escapeHtml(env.COMPANY_ADDRESS as string)}`
    : "";
  return `
  <p style="margin-top:24px;font-size:12px;color:#666;">
    You received this because you signed up at ${escapeHtml(host)}.<br/>
    <a href="${unsubscribeUrl}">Unsubscribe</a>${addressLine}
  </p>`;
}

export function footerText(env: Env, unsubscribeUrl: string): string {
  const host = siteHost(env);
  const addressLine = hasAddress(env) ? `\n${env.COMPANY_ADDRESS}` : "";
  return `\n\n---\nYou received this because you signed up at ${host}.\nUnsubscribe: ${unsubscribeUrl}${addressLine}`;
}

export function confirmEmail(
  env: Env,
  confirmUrl: string,
): { subject: string; html: string; text: string } {
  const subject = `Confirm your subscription to ${brandName(env)}`;
  const site = siteUrl(env);
  const addressLineHtml = hasAddress(env)
    ? `${escapeHtml(env.COMPANY_ADDRESS as string)}<br/>`
    : "";
  const addressLineText = hasAddress(env) ? `\n${env.COMPANY_ADDRESS}` : "";
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">
  <p>Thanks for signing up.</p>
  <p><a href="${confirmUrl}">Confirm your email</a></p>
  <p>If you did not request this, ignore this message.</p>
  <p style="margin-top:24px;font-size:12px;color:#666;">${addressLineHtml}<a href="${site}">${escapeHtml(site)}</a></p>
  </body></html>`;
  const text = `Thanks for signing up.\nConfirm your email: ${confirmUrl}\nIf you did not request this, ignore this message.${addressLineText}\n${site}`;
  return { subject, html, text };
}

function okPageShell(title: string, heading: string, body: string, env: Env): string {
  const site = siteUrl(env);
  const name = brandName(env);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;line-height:1.6;margin:0;padding:3rem 1.5rem;background:#fff;color:#111}main{max-width:36rem;margin:auto}h1{font-size:1.3rem;font-weight:600;margin:0 0 .5rem}p{margin:.5rem 0;color:#444}a{color:inherit}</style>
  </head>
  <body><main>
  <p style="font-size:.85rem;color:#888;margin-bottom:1.5rem"><a href="${escapeHtml(site)}">${escapeHtml(name)}</a></p>
  <h1>${escapeHtml(heading)}</h1>
  <p>${body}</p>
  </main></body></html>`;
}

export function confirmOkPage(env: Env): string {
  return okPageShell("Confirmed", "You're subscribed", "Thanks — we'll be in touch.", env);
}

export function unsubscribedPage(env: Env): string {
  return okPageShell("Unsubscribed", "You're unsubscribed", "You won't receive any further emails.", env);
}

export function campaignEmail(
  env: Env,
  _subject: string,
  htmlBody: string,
  textBody: string,
  unsubscribeUrl: string,
): { html: string; text: string } {
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">
  ${htmlBody}
  ${footerBlock(env, unsubscribeUrl)}
  </body></html>`;
  const text = `${textBody}${footerText(env, unsubscribeUrl)}`;
  return { html, text };
}
