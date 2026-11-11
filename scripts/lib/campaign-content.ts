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
    .replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * House-style rules for campaign Markdown. `DEFAULT_CAMPAIGN_RULES` apply
 * unless `campaigns/_templates/rules.json` exists next to the campaign file,
 * in which case that file replaces them. An empty `{}` rules file turns the
 * house style off; the unsubscribe link is always required.
 */
export interface CampaignRules {
  /** Text the campaign body must start with, such as "Hey,". */
  startsWith?: string;
  /** Regular expressions the campaign body must match, each with its error. */
  patterns?: Array<{ pattern: string; message: string }>;
  /** Strings the subject line must not contain. */
  subjectMustNotContain?: string[];
}

export const DEFAULT_CAMPAIGN_RULES: CampaignRules = {
  startsWith: "Hey,",
  patterns: [
    {
      pattern: "\\nMore soon\\.\\n\\n(\u2014 |\\\\- ).+[ ]{2}\\n\\*.+\\*\\n",
      message: 'Campaign body must include the closing "More soon.", then a signature line, then an italic tagline.',
    },
    {
      pattern: "You're receiving this because you subscribed to .+\\.[ ]{2}\\nNo longer interested\\?",
      message: 'Campaign footer must include "You\'re receiving this because you subscribed to <Name>." followed by "No longer interested?".',
    },
    {
      pattern: "\\[Unsubscribe →\\]\\(\\{\\{unsubscribe_url\\}\\}\\)",
      message: 'Campaign body must link "Unsubscribe →" to {{unsubscribe_url}}.',
    },
  ],
  subjectMustNotContain: ["\u2014"],
};

export function validateCampaignMarkdown(
  md: string,
  rules: CampaignRules = DEFAULT_CAMPAIGN_RULES,
): string[] {
  const errors: string[] = [];
  const trimmed = md.trim();

  if (!trimmed.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    errors.push(`Campaign body must include ${UNSUBSCRIBE_PLACEHOLDER}.`);
  }
  if (rules.startsWith && !trimmed.startsWith(rules.startsWith)) {
    errors.push(`Campaign body must start with "${rules.startsWith}".`);
  }
  for (const { pattern, message } of rules.patterns ?? []) {
    if (!new RegExp(pattern).test(trimmed)) errors.push(message);
  }

  return errors;
}

export function validateCampaignSubject(
  subject: string,
  rules: CampaignRules = DEFAULT_CAMPAIGN_RULES,
): string[] {
  return (rules.subjectMustNotContain ?? [])
    .filter((text) => subject.includes(text))
    .map((text) => `Campaign subject must not contain "${text}".`);
}

/** A campaign that breaks the house style or the unsubscribe requirement. */
export class CampaignStyleError extends Error {}

export function renderCampaignMarkdown(
  source: string,
  options: CampaignRenderOptions = {},
  rules: CampaignRules = DEFAULT_CAMPAIGN_RULES,
): CampaignRenderResult {
  const { data, body } = parseFrontmatter(source);
  const slug = options.slug ?? data.slug;
  const subject = options.subject ?? data.subject;
  const typeRaw = options.type ?? data.type;

  if (!slug) throw new Error("Missing campaign slug.");
  if (!subject) throw new Error("Missing campaign subject.");
  const subjectErrors = validateCampaignSubject(subject, rules);
  if (subjectErrors.length > 0) throw new CampaignStyleError(subjectErrors.join("\n"));
  if (!typeRaw || !isCampaignType(typeRaw)) {
    throw new Error("Campaign type must be update, episode, or other.");
  }

  const kindRaw = options.kind ?? campaignKindForType(typeRaw);
  if (!isCampaignKind(kindRaw)) {
    throw new Error("Campaign kind must be manual, new_post, or new_show.");
  }

  const errors = validateCampaignMarkdown(body, rules);
  if (errors.length > 0) throw new CampaignStyleError(errors.join("\n"));

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

function findTemplatesFile(markdownFile: string, name: string): string | null {
  let dir = dirname(resolve(markdownFile));
  for (;;) {
    const candidate = join(dir, "_templates", name);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function expandCampaignFooterPlaceholder(source: string, markdownFile: string): string {
  if (!source.includes(CAMPAIGN_FOOTER_PLACEHOLDER)) return source;
  const footerFile = findTemplatesFile(markdownFile, "footer.md");
  if (!footerFile) throw new Error("Missing campaigns/_templates/footer.md for {{campaign_footer}}.");
  const footer = readFileSync(footerFile, "utf8").trim();
  return source.replaceAll(CAMPAIGN_FOOTER_PLACEHOLDER, footer);
}

export function loadCampaignRules(markdownFile: string): CampaignRules {
  const rulesFile = findTemplatesFile(markdownFile, "rules.json");
  if (!rulesFile) return DEFAULT_CAMPAIGN_RULES;
  return JSON.parse(readFileSync(rulesFile, "utf8")) as CampaignRules;
}

export function renderCampaignMarkdownFile(
  file: string,
  options: CampaignRenderOptions = {},
): CampaignRenderResult {
  const rulesFile = findTemplatesFile(file, "rules.json");
  try {
    return renderCampaignMarkdown(
      expandCampaignFooterPlaceholder(readFileSync(file, "utf8"), file),
      options,
      loadCampaignRules(file),
    );
  } catch (e) {
    if (!(e instanceof CampaignStyleError)) throw e;
    const source = rulesFile
      ? `These rules come from ${rulesFile}.`
      : "These are the default house style rules. Start new campaigns from " +
        "examples/campaigns/ in the newsletter repo, or add " +
        "campaigns/_templates/rules.json to use your own rules. See " +
        '"Campaign style" in SETUP.md.';
    throw new CampaignStyleError(`${e.message}\n\n${source}`);
  }
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
