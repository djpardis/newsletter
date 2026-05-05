import type { Env } from "../types.js";

const TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export interface CleanupSummary {
  rate_limits: number;
  verification_tokens: number;
  events_audit: number;
}

export async function runCleanup(
  env: Env,
  now: number = Date.now(),
): Promise<CleanupSummary> {
  // Prune expired D1 rate-limit rows. This is a no-op for deployments that
  // use the native Rate Limiting binding, but keeps the table clean for
  // those still on the D1 fallback path.
  const rl = await env.DB.prepare(
    `DELETE FROM rate_limits WHERE expires_at < ?`,
  )
    .bind(now)
    .run();

  const tokens = await env.DB.prepare(
    `DELETE FROM verification_tokens
     WHERE (used_at IS NOT NULL AND used_at < ?)
        OR expires_at < ?`,
  )
    .bind(now - TOKEN_RETENTION_MS, now - TOKEN_RETENTION_MS)
    .run();

  const audit = await env.DB.prepare(
    `DELETE FROM events_audit WHERE created_at < ?`,
  )
    .bind(now - AUDIT_RETENTION_MS)
    .run();

  return {
    rate_limits: rl.meta?.changes ?? 0,
    verification_tokens: tokens.meta?.changes ?? 0,
    events_audit: audit.meta?.changes ?? 0,
  };
}
