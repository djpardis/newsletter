export function authorizeBearer(request: Request, expected: string): boolean {
  const h = request.headers.get("Authorization");
  if (!h || !expected) return false;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m) return false;
  return timingSafeStringEqual(m[1], expected);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
