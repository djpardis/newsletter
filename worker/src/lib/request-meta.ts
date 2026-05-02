import { sha256Hex } from "./crypto.js";

export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    null
  );
}

export async function hashMeta(request: Request): Promise<{
  ipHash: string | null;
  uaHash: string | null;
}> {
  const ip = getClientIp(request) ?? "";
  const ua = request.headers.get("User-Agent") ?? "";
  const ipHash = ip ? await sha256Hex(`v1|ip|${ip}`) : null;
  const uaHash = ua ? await sha256Hex(`v1|ua|${ua}`) : null;
  return { ipHash, uaHash };
}
