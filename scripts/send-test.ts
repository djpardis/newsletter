/**
 * One-command test send: create a campaign from Markdown (or reuse one) and
 * immediately test-send it to any address.
 *
 * Usage:
 *   npx tsx scripts/send-test.ts --md campaigns/test-01.md --to anyone@example.com
 *   npx tsx scripts/send-test.ts --id <uuid> --to anyone@example.com
 *
 * Reads NEWSLETTER_API_URL, ADMIN_BEARER_TOKEN, and NEWSLETTER_D1_NAME from a
 * local .env (gitignored) so there is nothing to export by hand. CLI/shell env
 * values win over .env.
 *
 * Test sends do not update delivery metrics. Recipients who are not active
 * subscribers get a preview unsubscribe link; everyone gets a real send.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCampaignMarkdownFile } from "./lib/campaign-content.js";
import { runD1Sql } from "./lib/wrangler-d1.js";
import { assertWorkerUpToDate } from "./lib/version-guard.js";

function loadEnvFile(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Shell-exported env wins so a one-off override still works.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function datedSlug(mdFile: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = basename(mdFile)
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "test";
  return `${date}-${base}-${randomUUID().slice(0, 6)}`;
}

function createCampaignFromMarkdown(mdFile: string): string {
  const slug = arg("--slug") ?? datedSlug(mdFile);
  const campaign = renderCampaignMarkdownFile(mdFile, {
    slug,
    subject: arg("--subject"),
    type: arg("--type"),
    kind: arg("--kind"),
  });
  const id = randomUUID();
  const now = Date.now();
  const sql = `INSERT INTO campaigns (id, slug, subject, kind, html_body, text_body, created_at, sent_at)
    VALUES ('${esc(id)}', '${esc(campaign.slug)}', '${esc(campaign.subject)}', '${esc(campaign.kind)}', '${esc(campaign.html)}', '${esc(campaign.text)}', ${now}, NULL);`;
  runD1Sql(sql);
  console.error(`Created campaign ${id} (slug ${campaign.slug})`);
  return id;
}

async function testSend(base: string, token: string, id: string, to: string): Promise<boolean> {
  const res = await fetch(`${base}/api/campaigns/test-send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ campaign_id: id, email: to }),
  });
  console.log(await res.text());
  return res.ok;
}

async function main() {
  loadEnvFile();

  const base = process.env.NEWSLETTER_API_URL?.replace(/\/$/, "");
  const token = process.env.ADMIN_BEARER_TOKEN;
  const to = arg("--to");
  const mdFile = arg("--md");
  const existingId = arg("--id");

  if (!base || !token) {
    console.error("Set NEWSLETTER_API_URL and ADMIN_BEARER_TOKEN (in .env or the shell).");
    process.exit(1);
  }
  if (!to) {
    console.error("Provide --to <email>.");
    process.exit(1);
  }
  if (!mdFile && !existingId) {
    console.error("Provide --md <file.md> (to create a campaign) or --id <uuid> (to reuse one).");
    process.exit(1);
  }

  await assertWorkerUpToDate(base, { skip: process.argv.includes("--skip-version-check") });

  let id: string;
  try {
    id = existingId ?? createCampaignFromMarkdown(mdFile as string);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const ok = await testSend(base, token, id, to);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
