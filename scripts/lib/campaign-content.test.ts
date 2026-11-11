import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  campaignKindForType,
  expandCampaignFooterPlaceholder,
  previewWithUnsubscribeUrl,
  renderCampaignMarkdown,
  renderCampaignMarkdownFile,
  validateCampaignSubject,
  validateCampaignMarkdown,
  type CampaignRules,
} from "./campaign-content.js";

const houseRules: CampaignRules = {
  startsWith: "Hey,",
  patterns: [
    { pattern: "\\nMore soon\\.\\n", message: 'Campaign body must include "More soon."' },
  ],
  subjectMustNotContain: ["\u2014"],
};

const goodCampaign = `---
slug: 2026-05-test
subject: "Test campaign"
type: update
---

Hey,

This is a [link](https://example.com).

More soon.

\u2014 Example Sender  
*A short tagline.*

You're receiving this because you subscribed to Example Sender.  
No longer interested? [Unsubscribe →]({{unsubscribe_url}})`;

describe("campaign-content", () => {
  it("reads frontmatter and renders minimal HTML", () => {
    const campaign = renderCampaignMarkdown(goodCampaign);

    expect(campaign.slug).toBe("2026-05-test");
    expect(campaign.subject).toBe("Test campaign");
    expect(campaign.type).toBe("update");
    expect(campaign.kind).toBe("manual");
    expect(campaign.html).toContain("<!DOCTYPE html>\n<html>\n<body>");
    expect(campaign.html).not.toContain("font-family");
    expect(campaign.html).not.toContain("style=");
    expect(campaign.html).toContain('<a href="https://example.com">link</a>');
    expect(campaign.html).toContain("<em>A short tagline.</em>");
    expect(campaign.html).toContain("Example Sender<br>");
    expect(campaign.html).toContain("You&#39;re receiving this because you subscribed to Example Sender.<br>");
    expect(campaign.html).toContain('No longer interested? <a href="{{unsubscribe_url}}">Unsubscribe →</a>');
  });

  it("renders plain text fallback with visible URLs", () => {
    const campaign = renderCampaignMarkdown(goodCampaign);

    expect(campaign.text).toContain("This is a link (https://example.com).");
    expect(campaign.text).toContain(
      "No longer interested? Unsubscribe → ({{unsubscribe_url}})",
    );
  });

  it("removes Markdown escapes from the plain text fallback", () => {
    const campaign = renderCampaignMarkdown(
      goodCampaign.replace("\u2014 Example Sender", "\\- Example Sender"),
    );

    expect(campaign.html).toContain("<p>- Example Sender<br>");
    expect(campaign.text).toContain("\n- Example Sender");
    expect(campaign.text).not.toContain("\\-");
  });

  it("replaces unsubscribe placeholders in preview output", () => {
    const campaign = renderCampaignMarkdown(goodCampaign);
    const preview = previewWithUnsubscribeUrl(
      campaign,
      "https://newsletter.example.com/api/unsubscribe?token=U",
    );

    expect(preview.html).toContain(
      'No longer interested? <a href="https://newsletter.example.com/api/unsubscribe?token=U">Unsubscribe →</a>',
    );
    expect(preview.text).toContain(
      "No longer interested? Unsubscribe → (https://newsletter.example.com/api/unsubscribe?token=U)",
    );
  });

  it("applies the house style by default", () => {
    const body = goodCampaign.split("---\n\n")[1] ?? "";
    expect(validateCampaignMarkdown(body)).toEqual([]);
    expect(validateCampaignMarkdown(body.replace("\u2014 Example", "\\- Example"))).toEqual([]);
    expect(validateCampaignMarkdown(`Hello\n${body}`)).toContain('Campaign body must start with "Hey,".');
    expect(validateCampaignMarkdown(body.replace("More soon.", "Bye.")).join("\n")).toContain("More soon.");
    expect(validateCampaignMarkdown("Hello")).toContain("Campaign body must include {{unsubscribe_url}}.");
    expect(validateCampaignSubject("Update \u2014 May")).toEqual([
      'Campaign subject must not contain "\u2014".',
    ]);
  });

  it("uses the house style when no rules file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "newsletter-default-rules-test-"));
    mkdirSync(join(root, "campaigns"), { recursive: true });
    const file = join(root, "campaigns", "issue.md");
    writeFileSync(file, goodCampaign.replace("Hey,", "Hello,"), "utf8");

    expect(() => renderCampaignMarkdownFile(file)).toThrow('Campaign body must start with "Hey,".');
  });

  it("explains where the default rules come from when a campaign breaks them", () => {
    const root = mkdtempSync(join(tmpdir(), "newsletter-hint-test-"));
    mkdirSync(join(root, "campaigns"), { recursive: true });
    const file = join(root, "campaigns", "issue.md");
    writeFileSync(file, goodCampaign.replace("Hey,", "Hello,"), "utf8");

    expect(() => renderCampaignMarkdownFile(file)).toThrow("These are the default house style rules.");
  });

  it("accepts the starter campaign in examples/campaigns", () => {
    const file = join(process.cwd(), "examples", "campaigns", "_templates", "post.md");
    const campaign = renderCampaignMarkdownFile(file);

    expect(campaign.text).toContain("- Sender name");
    expect(campaign.text).toContain("No longer interested? Unsubscribe → ({{unsubscribe_url}})");
  });

  it("lets an empty rules file turn the house style off", () => {
    const root = mkdtempSync(join(tmpdir(), "newsletter-empty-rules-test-"));
    const templatesDir = join(root, "campaigns", "_templates");
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(join(templatesDir, "rules.json"), "{}", "utf8");
    const file = join(root, "campaigns", "issue.md");
    writeFileSync(file, goodCampaign.replace("Hey,", "Hello,"), "utf8");

    expect(renderCampaignMarkdownFile(file).text).toContain("Hello,");
  });

  it("applies custom rules in place of the defaults", () => {
    const body = goodCampaign.split("---\n\n")[1] ?? "";
    expect(validateCampaignMarkdown(body, houseRules)).toEqual([]);
    expect(validateCampaignMarkdown(`Hello\n${body}`, houseRules)).toContain(
      'Campaign body must start with "Hey,".',
    );
    expect(validateCampaignMarkdown(body.replace("More soon.", "Bye."), houseRules)).toContain(
      'Campaign body must include "More soon."',
    );
    expect(validateCampaignSubject("Update \u2014 May", houseRules)).toEqual([
      'Campaign subject must not contain "\u2014".',
    ]);
  });

  it("loads custom rules from the campaign templates folder", () => {
    const root = mkdtempSync(join(tmpdir(), "newsletter-rules-test-"));
    const templatesDir = join(root, "campaigns", "_templates");
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(join(templatesDir, "rules.json"), JSON.stringify(houseRules), "utf8");
    const file = join(root, "campaigns", "issue.md");
    writeFileSync(file, goodCampaign.replace("Hey,", "Hello,"), "utf8");

    expect(() => renderCampaignMarkdownFile(file)).toThrow('Campaign body must start with "Hey,".');
  });

  it("expands the shared footer marker from the site campaign folder", () => {
    const root = mkdtempSync(join(tmpdir(), "newsletter-campaign-test-"));
    const campaignsDir = join(root, "campaigns");
    const templatesDir = join(campaignsDir, "_templates");
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(
      join(templatesDir, "footer.md"),
      "More soon.\n\nExample Sender  \n*A short tagline.*\n\nYou're receiving this because you subscribed to Example Sender.  \nNo longer interested? [Unsubscribe →]({{unsubscribe_url}})\n",
      "utf8",
    );
    const campaignPath = join(templatesDir, "update.md");
    const source = [
      "---",
      "slug: 2026-05-test",
      'subject: "Test campaign"',
      "type: update",
      "---",
      "",
      "Hey,",
      "",
      "Body.",
      "",
      "{{campaign_footer}}",
    ].join("\n");

    const expanded = expandCampaignFooterPlaceholder(
      source,
      campaignPath,
    );

    expect(expanded).toContain("More soon.");
    expect(expanded).toContain("No longer interested? [Unsubscribe →]({{unsubscribe_url}})");
  });

  it("maps campaign types to supported Worker campaign kinds", () => {
    expect(campaignKindForType("update")).toBe("manual");
    expect(campaignKindForType("episode")).toBe("new_show");
    expect(campaignKindForType("other")).toBe("manual");
  });
});
