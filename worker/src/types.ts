export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  BASE_URL: string;
  ADMIN_BEARER_TOKEN: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Resend webhook signing secret (Svix). Begins with whsec_. */
  RESEND_WEBHOOK_SECRET?: string;
  /** Physical/postal line for CAN-SPAM-style footer */
  COMPANY_ADDRESS?: string;
  /** Display name in confirmation subject (default: Newsletter) */
  SITE_NAME?: string;
  /** Optional mailto for List-Unsubscribe (e.g. list-unsubscribe@yourdomain.com) */
  UNSUBSCRIBE_MAILTO?: string;
  /** Allowed origin for CORS (default: mirror request Origin or *) */
  CORS_ORIGIN?: string;
  /**
   * Public website URL (no trailing slash). Distinct from `BASE_URL`, which
   * must point at the Worker for confirm/unsubscribe links to resolve.
   * When set, `GET /` on the Worker redirects (301) here, and email footers
   * link here instead of the Worker hostname. Falls back to `BASE_URL`.
   */
  SITE_URL?: string;
  /** Short tagline shown after the sender signature in emails (e.g. "Boring on purpose."). */
  SITE_TAGLINE?: string;
  /** Git SHA injected at deploy time via --var DEPLOY_SHA:$(git rev-parse --short HEAD) */
  DEPLOY_SHA?: string;
  /** Cloudflare Rate Limiting binding for /api/subscribe */
  SUBSCRIBE_RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  /** Cloudflare Queue for async campaign sends */
  SEND_QUEUE?: Queue<SendMessage>;
}

export interface SendMessage {
  campaign_id: string;
  subscriber_id: string;
}

export type SubscriberStatus =
  | "pending"
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained";

export type CampaignKind = "new_post" | "new_show" | "manual";
