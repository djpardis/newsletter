import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { marked } from "marked";
import type { CampaignKind } from "../../worker/src/types.js";

export type CampaignType = "update" | "episode" | "other";

export interface CampaignFrontmatter {
  slug?: string;
  subject?: string;
  type?: CampaignType;
}

export interface CampaignRenderOptions {
  slug?: string;
  subject?: string;
  type?: string;
  kind?: string;
}

export interface CampaignRenderResult {
  slug: string;
  subject: string;
  type: CampaignType;
  kind: CampaignKind;
  markdown: string;
  html: string;
  text: string;
}

const UNSUBSCRIBE_PLACEHOLDER = "{{unsubscribe_url}}";
const ENCODED_UNSUBSCRIBE_PLACEHOLDER = "%7B%7Bunsubscribe_url%7D%7D";
const CAMPAIGN_FOOTER_PLACEHOLDER = "{{campaign_footer}}";

function frontmatterValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseFrontmatter(source: string): {
  data: CampaignFrontmatter;
  body: string;
} {
  if (!source.startsWith("---\n")) return { data: {}, body: source.trim() };
  const end = source.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: source.trim() };

  const data: CampaignFrontmatter = {};
  const header = source.slice(4, end).trim();
  for (const line of header.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = frontmatterValue(line.slice(sep + 1));
    if (key === "slug") data.slug = value;
    if (key === "subject") data.subject = value;
    if (key === "type" && isCampaignType(value)) data.type = value;
  }

  return { data, body: source.slice(end + 4).trim() };
}

export function isCampaignType(value: string): value is CampaignType {
  return value === "update" || value === "episode" || value === "other";
}

export function campaignKindForType(type: CampaignType): CampaignKind {
  if (type === "episode") return "new_show";
  return "manual";
}

export function isCampaignKind(value: string): value is CampaignKind {
  return value === "manual" || value === "new_post" || value === "new_show";
}

function mdToHtml(md: string): string {
  const inner = (marked.parse(md, { async: false }) as string).replaceAll(
    ENCODED_UNSUBSCRIBE_PLACEHOLDER,
    UNSUBSCRIBE_PLACEHOLDER,
  );
  return `<!DOCTYPE html>
<html>
<body>
${inner.trimEnd()}
</body>
</html>`;
}

function mdToText(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^[-*+]\s+/gm, "- ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>{1,}\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateCampaignMarkdown(md: string): string[] {
  const errors: string[] = [];
  const trimmed = md.trim();

  if (!trimmed.startsWith("Hey,")) {
    errors.push('Campaign body must start with "Hey,".');
  }
  if (!/\nMore soon\.\n\n— .+  \n\*.+\*\n/.test(trimmed)) {
    errors.push('Campaign body must include closing: "More soon." then a "— Name  " signature line then "*tagline*".');
  }
  if (!trimmed.includes("{{unsubscribe_url}}")) {
    errors.push("Campaign body must include {{unsubscribe_url}}.");
  }
  if (!/You're receiving this because you subscribed to .+\.  \nNo longer interested\?/.test(trimmed)) {
    errors.push('Campaign footer must include "You\'re receiving this because you subscribed to <Name>.  \\nNo longer interested?"');
  }
  if (!/\[Unsubscribe →\]\(\{\{unsubscribe_url\}\}\)/.test(trimmed)) {
    errors.push('Campaign body must link only "Unsubscribe →" to {{unsubscribe_url}}.');
  }

  return errors;
}

export function validateCampaignSubject(subject: string): string[] {
  const errors: string[] = [];
  if (subject.includes("—")) {
    errors.push("Campaign subject must not use an em dash. Write it like a news update.");
  }
  return errors;
}

export function renderCampaignMarkdown(
  source: string,
  options: CampaignRenderOptions = {},
): CampaignRenderResult {
  const { data, body } = parseFrontmatter(source);
  const slug = options.slug ?? data.slug;
  const subject = options.subject ?? data.subject;
  const typeRaw = options.type ?? data.type;

  if (!slug) throw new Error("Missing campaign slug.");
  if (!subject) throw new Error("Missing campaign subject.");
  const subjectErrors = validateCampaignSubject(subject);
  if (subjectErrors.length > 0) throw new Error(subjectErrors.join("\n"));
  if (!typeRaw || !isCampaignType(typeRaw)) {
    throw new Error("Campaign type must be update, episode, or other.");
  }

  const kindRaw = options.kind ?? campaignKindForType(typeRaw);
  if (!isCampaignKind(kindRaw)) {
    throw new Error("Campaign kind must be manual, new_post, or new_show.");
  }

  const errors = validateCampaignMarkdown(body);
  if (errors.length > 0) throw new Error(errors.join("\n"));

  return {
    slug,
    subject,
    type: typeRaw,
    kind: kindRaw,
    markdown: body,
    html: mdToHtml(body),
    text: mdToText(body),
  };
}

function findCampaignFooterFile(markdownFile: string): string {
  let dir = dirname(resolve(markdownFile));
  for (;;) {
    const candidate = join(dir, "_templates", "footer.md");
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error("Missing campaigns/_templates/footer.md for {{campaign_footer}}.");
}

export function expandCampaignFooterPlaceholder(source: string, markdownFile: string): string {
  if (!source.includes(CAMPAIGN_FOOTER_PLACEHOLDER)) return source;
  const footer = readFileSync(findCampaignFooterFile(markdownFile), "utf8").trim();
  return source.replaceAll(CAMPAIGN_FOOTER_PLACEHOLDER, footer);
}

export function renderCampaignMarkdownFile(
  file: string,
  options: CampaignRenderOptions = {},
): CampaignRenderResult {
  return renderCampaignMarkdown(
    expandCampaignFooterPlaceholder(readFileSync(file, "utf8"), file),
    options,
  );
}

export function previewWithUnsubscribeUrl(
  content: CampaignRenderResult,
  unsubscribeUrl: string,
): { html: string; text: string } {
  return {
    html: content.html
      .replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl)
      .replaceAll(ENCODED_UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl),
    text: content.text.replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl),
  };
}
