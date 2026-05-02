import type { Env } from "../types.js";

export function corsHeaders(env: Env, request: Request): HeadersInit {
  const origin = env.CORS_ORIGIN ?? "*";
  const reqOrigin = request.headers.get("Origin");
  const allow =
    origin === "*" && reqOrigin
      ? reqOrigin
      : origin === "*"
        ? "*"
        : origin;
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
