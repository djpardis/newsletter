/**
 * Normalize email: trim + lowercase. Returns null if empty/invalid shape.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (!e || e.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/**
 * Honeypot: if present and non-empty, treat as bot (caller returns fake ok).
 */
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  const hp =
    body.website ?? body.url ?? body.company ?? body.hp ?? body.address;
  if (hp === undefined || hp === null) return false;
  if (typeof hp === "string" && hp.trim() === "") return false;
  return true;
}

export function safeMetadata(obj: unknown): string | null {
  if (obj === undefined || obj === null) return null;
  if (typeof obj !== "object" || Array.isArray(obj)) return null;
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

export function parseJsonBody(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
