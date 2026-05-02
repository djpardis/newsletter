import type { Env } from "../types.js";

export function listUnsubscribeHeaders(
  env: Env,
  oneClickUrl: string,
): Record<string, string> {
  const parts: string[] = [`<${oneClickUrl}>`];
  if (env.UNSUBSCRIBE_MAILTO && env.UNSUBSCRIBE_MAILTO.includes("@")) {
    parts.push(`<mailto:${env.UNSUBSCRIBE_MAILTO}?subject=unsubscribe>`);
  }
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
