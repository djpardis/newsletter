import type { Env } from "../types.js";

export function health(env: Env): Response {
  return Response.json({
    ok: true,
    service: "newsletter",
    sha: env.DEPLOY_SHA ?? "unknown",
  });
}
