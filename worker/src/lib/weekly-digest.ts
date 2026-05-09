import type { Env, SubscriberStatus } from "../types.js";
import { sendEmail } from "./resend.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const OLD_PENDING_MS = 48 * 60 * 60 * 1000;
const MAX_LIST_ITEMS = 25;

type EventWithEmail = {
  email: string;
  created_at: number;
  source?: string | null;
  status?: string | null;
};

type StatusTotal = {
  status: SubscriberStatus;
  count: number;
};

type CampaignSummary = {
  id: string;
  slug: string;
  subject: string;
  sent_at: number;
  sent: number;
  failed: number;
};

type SourceSummary = {
  source: string;
  count: number;
};

export interface WeeklyDigestSummary {
  start: number;
  end: number;
  newSubscribers: EventWithEmail[];
  reactivatedSubscribers: EventWithEmail[];
  unsubscribes: EventWithEmail[];
  bounces: EventWithEmail[];
  complaints: EventWithEmail[];
  statusTotals: StatusTotal[];
  campaigns: CampaignSummary[];
  sources: SourceSummary[];
  oldPendingCount: number;
}

function digestRecipient(env: Env): string | null {
  return env.DIGEST_EMAIL ?? env.NOTIFY_EMAIL ?? null;
}

export function shouldSendWeeklyDigest(now: number = Date.now()): boolean {
  return new Date(now).getUTCDay() === 1;
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(ts));
}

function listSection<T>(
  title: string,
  rows: T[],
  render: (row: T) => string,
): string[] {
  const lines = [title];
  if (rows.length === 0) return [...lines, "- None"];
  lines.push(...rows.slice(0, MAX_LIST_ITEMS).map((row) => `- ${render(row)}`));
  if (rows.length > MAX_LIST_ITEMS) {
    lines.push(`- ...and ${rows.length - MAX_LIST_ITEMS} more`);
  }
  return lines;
}

function countStatus(summary: WeeklyDigestSummary, status: SubscriberStatus): number {
  return summary.statusTotals.find((row) => row.status === status)?.count ?? 0;
}

async function all<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...args).all<T>();
  return result.results ?? [];
}

async function first<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...args).first<T>();
}

export async function collectWeeklyDigest(
  env: Env,
  now: number = Date.now(),
): Promise<WeeklyDigestSummary> {
  const end = now;
  const start = now - WEEK_MS;

  const [
    newSubscribers,
    reactivatedSubscribers,
    unsubscribes,
    bounces,
    complaints,
    statusTotals,
    campaigns,
    sources,
    oldPending,
  ] = await Promise.all([
    all<EventWithEmail>(
      env.DB,
      `SELECT email, created_at, source, status
       FROM subscribers
       WHERE created_at >= ? AND created_at < ?
       ORDER BY created_at DESC`,
      start,
      end,
    ),
    all<EventWithEmail>(
      env.DB,
      `SELECT s.email, e.created_at, s.source, s.status
       FROM events_audit e
       JOIN subscribers s ON s.id = e.subscriber_id
       WHERE e.event_type = 'subscribe_reactivated'
         AND e.created_at >= ? AND e.created_at < ?
       ORDER BY e.created_at DESC`,
      start,
      end,
    ),
    all<EventWithEmail>(
      env.DB,
      `SELECT s.email, e.created_at, s.source, s.status
       FROM events_audit e
       JOIN subscribers s ON s.id = e.subscriber_id
       WHERE e.event_type = 'subscriber_unsubscribed'
         AND e.created_at >= ? AND e.created_at < ?
       ORDER BY e.created_at DESC`,
      start,
      end,
    ),
    all<EventWithEmail>(
      env.DB,
      `SELECT s.email, e.created_at, s.source, s.status
       FROM events_audit e
       JOIN subscribers s ON s.id = e.subscriber_id
       WHERE e.event_type = 'webhook_bounced'
         AND e.created_at >= ? AND e.created_at < ?
       ORDER BY e.created_at DESC`,
      start,
      end,
    ),
    all<EventWithEmail>(
      env.DB,
      `SELECT s.email, e.created_at, s.source, s.status
       FROM events_audit e
       JOIN subscribers s ON s.id = e.subscriber_id
       WHERE e.event_type = 'webhook_complained'
         AND e.created_at >= ? AND e.created_at < ?
       ORDER BY e.created_at DESC`,
      start,
      end,
    ),
    all<StatusTotal>(
      env.DB,
      `SELECT status, COUNT(*) as count
       FROM subscribers
       GROUP BY status
       ORDER BY status`,
    ),
    all<CampaignSummary>(
      env.DB,
      `SELECT
         c.id,
         c.slug,
         c.subject,
         c.sent_at,
         SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM campaigns c
       LEFT JOIN deliveries d ON d.campaign_id = c.id
       WHERE c.sent_at >= ? AND c.sent_at < ?
       GROUP BY c.id, c.slug, c.subject, c.sent_at
       ORDER BY c.sent_at DESC`,
      start,
      end,
    ),
    all<SourceSummary>(
      env.DB,
      `SELECT COALESCE(NULLIF(source, ''), 'unknown') as source, COUNT(*) as count
       FROM subscribers
       WHERE created_at >= ? AND created_at < ?
       GROUP BY COALESCE(NULLIF(source, ''), 'unknown')
       ORDER BY count DESC, source ASC
       LIMIT 10`,
      start,
      end,
    ),
    first<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) as count
       FROM subscribers
       WHERE status = 'pending' AND created_at < ?`,
      now - OLD_PENDING_MS,
    ),
  ]);

  return {
    start,
    end,
    newSubscribers,
    reactivatedSubscribers,
    unsubscribes,
    bounces,
    complaints,
    statusTotals,
    campaigns: campaigns.map((row) => ({
      ...row,
      sent: row.sent ?? 0,
      failed: row.failed ?? 0,
    })),
    sources,
    oldPendingCount: oldPending?.count ?? 0,
  };
}

export function renderWeeklyDigestText(
  env: Env,
  summary: WeeklyDigestSummary,
): string {
  const brand = env.SITE_NAME ?? "Newsletter";
  const newCount = summary.newSubscribers.length;
  const reactivatedCount = summary.reactivatedSubscribers.length;
  const unsubCount = summary.unsubscribes.length;
  const netGrowth = newCount + reactivatedCount - unsubCount;
  const lines = [
    `${brand} weekly newsletter digest`,
    `${formatDate(summary.start)} - ${formatDate(summary.end)}`,
    "",
    "Subscribers",
    `New rows: ${newCount}`,
    `Reactivated: ${reactivatedCount}`,
    `Unsubscribed: ${unsubCount}`,
    `Net change: ${netGrowth >= 0 ? "+" : ""}${netGrowth}`,
    `Active total: ${countStatus(summary, "active")}`,
    `Pending total: ${countStatus(summary, "pending")}`,
    `Unsubscribed total: ${countStatus(summary, "unsubscribed")}`,
    `Bounced total: ${countStatus(summary, "bounced")}`,
    `Complained total: ${countStatus(summary, "complained")}`,
    "",
    ...listSection(
      "New subscriber rows",
      summary.newSubscribers,
      (row) => `${row.email} - ${row.status ?? "unknown"} - ${row.source ?? "unknown"} - ${formatDateTime(row.created_at)}`,
    ),
    "",
    ...listSection(
      "Reactivated subscribers",
      summary.reactivatedSubscribers,
      (row) => `${row.email} - ${formatDateTime(row.created_at)}`,
    ),
    "",
    ...listSection(
      "Unsubscribes",
      summary.unsubscribes,
      (row) => `${row.email} - ${formatDateTime(row.created_at)}`,
    ),
    "",
    "Campaigns",
  ];

  if (summary.campaigns.length === 0) {
    lines.push("- None");
  } else {
    lines.push(
      ...summary.campaigns.map(
        (campaign) =>
          `- ${campaign.subject} (${campaign.slug}) - ${campaign.sent} sent, ${campaign.failed} failed - ${formatDateTime(campaign.sent_at)}`,
      ),
    );
  }

  lines.push("", "Top sources");
  if (summary.sources.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...summary.sources.map((row) => `- ${row.source}: ${row.count}`));
  }

  lines.push("", "Needs attention");
  const needsAttention = [
    summary.oldPendingCount > 0
      ? `${summary.oldPendingCount} pending confirmations older than 48 hours`
      : null,
    summary.bounces.length > 0 ? `${summary.bounces.length} bounce events this week` : null,
    summary.complaints.length > 0 ? `${summary.complaints.length} complaint events this week` : null,
  ].filter((row): row is string => row !== null);
  if (needsAttention.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...needsAttention.map((row) => `- ${row}`));
  }

  return lines.join("\n");
}

export async function sendWeeklyDigest(
  env: Env,
  now: number = Date.now(),
): Promise<{ sent: boolean; reason?: string }> {
  const to = digestRecipient(env);
  if (!to) return { sent: false, reason: "recipient_not_configured" };

  const summary = await collectWeeklyDigest(env, now);
  const text = renderWeeklyDigestText(env, summary);
  const result = await sendEmail(env, {
    to,
    subject: `${env.SITE_NAME ?? "Newsletter"} weekly digest`,
    text,
    transactional: true,
  });

  if (!result.ok) return { sent: false, reason: result.error };
  return { sent: true };
}
