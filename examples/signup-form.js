/**
 * Minimal client for POST /api/subscribe.
 *
 * Drop into any framework. Returns a discriminated union you can render against:
 *   { ok: true, state: "pending" | "active" }
 *   { ok: false, kind: "invalid_email" | "rate_limited" | "turnstile_failed" | "server_error", retryAfterSec?: number }
 *
 * @example
 *   const result = await subscribe(
 *     { email: "user@example.com", source: "homepage", turnstileToken },
 *     "https://your-worker.example.workers.dev",
 *   );
 *   if (result.ok) { showThanks(result.state); } else { showError(result.kind); }
 */
export async function subscribe(input, apiUrl) {
  const payload = {
    email: input.email,
    ...(input.source ? { source: input.source } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.turnstileToken ? { turnstile_token: input.turnstileToken } : {}),
  };

  let res;
  try {
    res = await fetch(`${apiUrl}/api/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, kind: "server_error" };
  }

  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    return { ok: true, state: body.state ?? "pending" };
  }
  if (res.status === 400 && body.error === "invalid_email") {
    return { ok: false, kind: "invalid_email" };
  }
  if (res.status === 400 && body.error === "turnstile_failed") {
    return { ok: false, kind: "turnstile_failed" };
  }
  if (res.status === 429) {
    return {
      ok: false,
      kind: "rate_limited",
      retryAfterSec: Number(body.retry_after_sec) || 60,
    };
  }
  return { ok: false, kind: "server_error" };
}
