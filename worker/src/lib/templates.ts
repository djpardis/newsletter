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

export function unsubscribedPage(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
  <body style="font-family:system-ui;padding:2rem;max-width:40rem">
  <h1>Unsubscribed</h1>
  <p>You will not receive further emails from this list.</p>
  </body></html>`;
}

export function confirmOkPage(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confirmed</title></head>
  <body style="font-family:system-ui;padding:2rem;max-width:40rem">
  <h1>You are confirmed</h1>
  <p>Thanks — you are subscribed.</p>
  </body></html>`;
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
