import type { Env } from "../types.js";
import { listUnsubscribeHeaders } from "./list-unsubscribe.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Used for List-Unsubscribe on marketing mail; ignored when transactional */
  unsubscribeUrl: string;
  /** Opt-in / transactional: omit List-Unsubscribe headers */
  transactional?: boolean;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(
  env: Env,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const payload: Record<string, unknown> = {
    from: env.FROM_EMAIL,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (!input.transactional) {
    payload.headers = listUnsubscribeHeaders(env, input.unsubscribeUrl);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    const err = json.message ?? json.error ?? res.statusText;
    return { ok: false, error: String(err) };
  }
  if (!json.id) return { ok: false, error: "missing_id" };
  return { ok: true, id: json.id };
}
