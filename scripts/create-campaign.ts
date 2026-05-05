/**
 * Create a campaign row (does not send).
 *
 * Usage — inline:
 *   npx tsx scripts/create-campaign.ts --slug issue-12 --subject "Hello" --kind manual --html "<p>Hi</p>" --text "Hi"
 *
 * Usage — from a Markdown file (recommended):
 *   npx tsx scripts/create-campaign.ts --slug issue-12 --subject "Hello" --kind manual --md post.md
 *
 *   The Markdown file is used as-is for the plain-text body and converted to
 *   minimal HTML for the HTML body. Links are rendered as <a href> in HTML and
 *   as "text (url)" in plain text.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { marked } from "marked";
import { runD1Sql } from "./lib/wrangler-d1.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

/** Convert Markdown to minimal HTML wrapped in a readable container. */
function mdToHtml(md: string): string {
  const inner = marked.parse(md, { async: false }) as string;
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:2em auto;line-height:1.5;color:#222;">
${inner.trimEnd()}
</body>
</html>`;
}

/**
 * Convert Markdown to plain text:
 * - Inline links become "text (url)"
 * - All other Markdown syntax is stripped
 * - Paragraph breaks are preserved
 */
function mdToText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")   // links: [text](url) → text (url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")           // images: stripped, alt text kept
    .replace(/^#{1,6}\s+/gm, "")                        // headings
    .replace(/(\*\*|__)(.*?)\1/g, "$2")                 // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")                    // italic
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")              // inline code
    .replace(/^[-*+]\s+/gm, "- ")                       // unordered lists
    .replace(/^\d+\.\s+/gm, "")                         // ordered lists
    .replace(/^>{1,}\s?/gm, "")                         // blockquotes
    .replace(/\n{3,}/g, "\n\n")                         // collapse extra blank lines
    .trim();
}

function main() {
  const slug = arg("--slug");
  const subject = arg("--subject");
  const kind = arg("--kind");
  const mdFile = arg("--md");
  const htmlArg = arg("--html");
  const textArg = arg("--text");

  if (!slug || !subject || !kind) {
    console.error(
      "Usage:\n" +
      "  npx tsx scripts/create-campaign.ts --slug S --subject S --kind manual|new_post|new_show --md post.md\n" +
      "  npx tsx scripts/create-campaign.ts --slug S --subject S --kind manual|new_post|new_show --html ... --text ...",
    );
    process.exit(1);
  }
  if (!["manual", "new_post", "new_show"].includes(kind)) {
    console.error("Invalid --kind. Must be manual, new_post, or new_show.");
    process.exit(1);
  }

  let html: string;
  let text: string;

  if (mdFile) {
    const md = readFileSync(mdFile, "utf8");
    html = mdToHtml(md);
    text = mdToText(md);
  } else if (htmlArg && textArg) {
    html = htmlArg;
    text = textArg;
  } else {
    console.error("Provide either --md <file> or both --html and --text.");
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
