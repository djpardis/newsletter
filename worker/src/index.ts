import type { Env } from "./types.js";
import { withCors } from "./lib/cors.js";
import { runCleanup } from "./lib/cleanup.js";
import { handleAdminDelete } from "./routes/admin.js";
import { handleSubscribe } from "./routes/subscribe.js";
import { handleConfirm } from "./routes/confirm.js";
import { handleUnsubscribe } from "./routes/unsubscribe.js";
import { handleCampaignSend } from "./routes/campaigns.js";
import { handleResendWebhook } from "./routes/webhooks.js";
import { health } from "./routes/health.js";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "GET" && path === "/" && env.SITE_URL) {
        return Response.redirect(env.SITE_URL.replace(/\/$/, "") + "/", 301);
      }

      if (request.method === "GET" && path === "/health") {
        return health();
      }

      if (path === "/api/subscribe") {
        if (request.method === "OPTIONS") {
          return withCors(env, request, new Response(null, { status: 204 }));
        }
        if (request.method === "POST") {
          const res = await handleSubscribe(request, env);
          return withCors(env, request, res);
        }
        return withCors(
          env,
          request,
          new Response("Method Not Allowed", { status: 405 }),
        );
      }

      if (request.method === "GET" && path === "/api/confirm") {
        return handleConfirm(request, env);
      }

      if (path === "/api/unsubscribe") {
        if (request.method === "GET" || request.method === "POST") {
          return handleUnsubscribe(request, env);
        }
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (request.method === "POST" && path === "/api/campaigns/send") {
        return handleCampaignSend(request, env);
      }

      if (request.method === "POST" && path === "/api/webhooks/resend") {
        return handleResendWebhook(request, env);
      }

      if (request.method === "POST" && path === "/api/admin/delete") {
        return handleAdminDelete(request, env);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      console.error(e);
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runCleanup(env).then(
        (s) => console.log("cleanup:", JSON.stringify(s)),
        (e) => console.error("cleanup_failed:", e),
      ),
    );
  },
};
