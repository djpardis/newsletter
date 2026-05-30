/**
 * Delete an unsent test campaign and its delivery rows.
 *
 * Usage:
 *   NEWSLETTER_D1_NAME=newsletter-djpardis npx tsx scripts/delete-campaign.ts --id <uuid>
 *
 * Refuses to delete a campaign that has already been sent unless --force is passed.
 */
import { runD1Sql, d1Name } from "./lib/wrangler-d1.js";
import { execFileSync } from "node:child_process";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function queryD1(sql: string): unknown[] {
  const output = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", d1Name(), "--remote", "--json", "--command", sql],
    { cwd: process.cwd() },
  ).toString();
  const parsed = JSON.parse(output) as { results?: unknown[] }[];
  return parsed[0]?.results ?? [];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

async function main() {
  const id = arg("--id");
  if (!id) {
    console.error("Usage: NEWSLETTER_D1_NAME=... npx tsx scripts/delete-campaign.ts --id <uuid> [--force]");
    process.exit(1);
  }

  const rows = queryD1(
    `SELECT id, slug, subject, sent_at FROM campaigns WHERE id = '${esc(id)}'`,
  ) as { id: string; slug: string; subject: string; sent_at: number | null }[];

  if (rows.length === 0) {
    console.error(`Campaign not found: ${id}`);
    process.exit(1);
  }

  const campaign = rows[0];
  console.error(`Campaign: [${campaign.slug}] "${campaign.subject}"`);

  if (campaign.sent_at !== null && !hasFlag("--force")) {
    console.error(
      `Refusing to delete — campaign was already sent at ${new Date(campaign.sent_at).toISOString()}.\n` +
      `Pass --force to delete anyway.`,
    );
    process.exit(1);
  }

  if (campaign.sent_at !== null) {
    console.error("Warning: deleting a campaign that was already sent (--force).");
  }

  runD1Sql(
    `DELETE FROM deliveries WHERE campaign_id = '${esc(id)}';
     DELETE FROM campaigns WHERE id = '${esc(id)}';`,
  );

  console.error(`Deleted campaign ${id} (${campaign.slug}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
