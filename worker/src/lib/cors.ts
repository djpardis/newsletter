import type { Env } from "../types.js";

function originMatches(pattern: string, origin: string): boolean {
  if (pattern === origin) return true;
  if (pattern.endsWith(":*")) {
    return origin.startsWith(pattern.slice(0, -1));
  }
  return false;
}

function allowedOrigin(configuredOrigin: string, requestOrigin: string | null): string {
  const origins = configuredOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    return requestOrigin ?? "*";
  }

  if (requestOrigin && origins.some((origin) => originMatches(origin, requestOrigin))) {
    return requestOrigin;
  }

  return origins[0] ?? "*";
}

export function corsHeaders(env: Env, request: Request): HeadersInit {
  const origin = env.CORS_ORIGIN ?? "*";
  const reqOrigin = request.headers.get("Origin");
  const allow = allowedOrigin(origin, reqOrigin);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, CF-Connecting-IP",
    "Access-Control-Max-Age": "86400",
  };
}

export function withCors(env: Env, request: Request, res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(env, request))) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
