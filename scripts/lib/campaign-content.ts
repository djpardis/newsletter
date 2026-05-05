import { readFileSync } from "node:fs";
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
  if (!trimmed.includes("\nMore soon.\n\n— Future Shock Media\nBoring on purpose.\n")) {
    errors.push("Campaign body must include the canonical closing/signature block.");
  }
  if (!trimmed.includes("You're receiving this because you subscribed to Future Shock Media. To stop, [unsubscribe here]({{unsubscribe_url}}).")) {
    errors.push("Campaign body must include the canonical unsubscribe footer link with {{unsubscribe_url}}.");
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

export function renderCampaignMarkdownFile(
  file: string,
  options: CampaignRenderOptions = {},
): CampaignRenderResult {
  return renderCampaignMarkdown(readFileSync(file, "utf8"), options);
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
