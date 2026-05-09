import type { Env } from "../types.js";
import { authorizeBearer } from "../lib/auth.js";
import { sendWeeklyDigest } from "../lib/weekly-digest.js";

export async function handleWeeklyDigestTestSend(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!authorizeBearer(request, env.ADMIN_BEARER_TOKEN)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendWeeklyDigest(env);
  if (!result.sent) {
    return Response.json(
      { ok: false, reason: result.reason ?? "send_failed" },
      { status: result.reason === "recipient_not_configured" ? 400 : 502 },
    );
  }

  return Response.json({ ok: true });
}
