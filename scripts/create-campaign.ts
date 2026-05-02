/**
 * Create a campaign row (does not send).
 *
 * Usage:
 *   npx tsx scripts/create-campaign.ts --slug issue-12 --subject "Hello" --kind manual --html "<p>Hi</p>" --text "Hi"
 */
import { randomUUID } from "node:crypto";
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
  const kind = arg("--kind");
  const html = arg("--html");
  const text = arg("--text");
  if (!slug || !subject || !kind || !html || !text) {
    console.error(
      "Usage: npx tsx scripts/create-campaign.ts --slug S --subject S --kind manual|new_post|new_show --html ... --text ...",
    );
    process.exit(1);
  }
  if (!["manual", "new_post", "new_show"].includes(kind)) {
    console.error("Invalid --kind");
    process.exit(1);
  }
  const id = randomUUID();
  const now = Date.now();
  const sql = `INSERT INTO campaigns (id, slug, subject, kind, html_body, text_body, created_at, sent_at)
    VALUES ('${esc(id)}', '${esc(slug)}', '${esc(subject)}', '${esc(kind)}', '${esc(html)}', '${esc(text)}', ${now}, NULL);`;
  runD1Sql(sql);
  console.error(id);
}

main();
