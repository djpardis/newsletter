/**
 * Create a campaign row (does not send).
 *
 * Usage — from a Markdown file (recommended):
 *   npx tsx scripts/create-campaign.ts --md ../107wins/campaigns/updates/issue-12.md
 *
 * The Markdown file frontmatter supplies slug, subject, and type unless CLI
 * flags override them.
 */
import { randomUUID } from "node:crypto";
import { renderCampaignMarkdownFile } from "./lib/campaign-content.js";
import { runD1Sql } from "./lib/wrangler-d1.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function main() {
  const slug = arg("--slug");
  const subject = arg("--subject");
  const type = arg("--type");
  const kind = arg("--kind");
  const mdFile = arg("--md");

  if (!mdFile) {
    console.error(
      "Usage:\n" +
      "  npx tsx scripts/create-campaign.ts --md campaign.md [--slug S] [--subject S] [--type update|episode|other] [--kind manual|new_post|new_show]",
    );
    process.exit(1);
  }

  let campaign;
  try {
    campaign = renderCampaignMarkdownFile(mdFile, { slug, subject, type, kind });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const id = randomUUID();
  const now = Date.now();
  const sql = `INSERT INTO campaigns (id, slug, subject, kind, html_body, text_body, created_at, sent_at)
    VALUES ('${esc(id)}', '${esc(campaign.slug)}', '${esc(campaign.subject)}', '${esc(campaign.kind)}', '${esc(campaign.html)}', '${esc(campaign.text)}', ${now}, NULL);`;
  runD1Sql(sql);
  console.error(id);
}

main();
