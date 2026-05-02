const WINDOW_MS = 60_000;
const MAX_SUBSCRIBE_PER_WINDOW = 8;

export async function checkSubscribeRateLimit(
  db: D1Database,
  bucketKey: string,
  now: number = Date.now(),
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const key = `${bucketKey}:${windowStart}`;
  const expires = windowStart + WINDOW_MS * 2;

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket_key, hit_count, expires_at)
       VALUES (?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET hit_count = hit_count + 1
       RETURNING hit_count`,
    )
    .bind(key, expires)
    .first<{ hit_count: number }>();

  const count = row?.hit_count ?? 0;
  if (count > MAX_SUBSCRIBE_PER_WINDOW) {
    const retryAfterSec = Math.ceil((windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  return { ok: true };
}
