/**
 * Svix-compatible webhook signature verification (used by Resend).
 *
 * Header layout:
 *   svix-id        : message id
 *   svix-timestamp : seconds since epoch
 *   svix-signature : space-separated list of "v1,<base64-hmac>"
 *
 * Signed payload: `${id}.${timestamp}.${rawBody}`
 * HMAC-SHA-256 with the base64-decoded secret (after stripping "whsec_").
 */

const TOLERANCE_MS = 5 * 60 * 1000;

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export interface SvixVerifyInput {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signatureHeader: string | null;
  rawBody: string;
  now?: number;
}

export async function verifySvixSignature(
  input: SvixVerifyInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { secret, id, timestamp, signatureHeader, rawBody } = input;
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs)) return { ok: false, reason: "bad_timestamp" };
  const now = input.now ?? Date.now();
  if (Math.abs(now - tsMs) > TOLERANCE_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeBase64(rawSecret);
  } catch {
    return { ok: false, reason: "bad_secret_encoding" };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const sigBuf = await crypto.subtle.sign("HMAC", key, signedPayload);
  const expected = encodeBase64(sigBuf);

  const candidates = signatureHeader
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));

  for (const c of candidates) {
    if (timingSafeEqual(c, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}
