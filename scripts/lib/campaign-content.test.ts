import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  campaignKindForType,
  expandCampaignFooterPlaceholder,
  previewWithUnsubscribeUrl,
  renderCampaignMarkdown,
  validateCampaignSubject,
  validateCampaignMarkdown,
} from "./campaign-content.js";

const goodCampaign = `---
slug: 2026-05-test
subject: "Test campaign"
type: update
---

Hey,

This is a [link](https://example.com).

More soon.

— DJ Pardis  
*Your next set.*

You're receiving this because you subscribed to DJ Pardis.  
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
    expect(campaign.html).toContain("<em>Your next set.</em>");
    expect(campaign.html).toContain("— DJ Pardis<br>");
    expect(campaign.html).toContain("You&#39;re receiving this because you subscribed to DJ Pardis.<br>");
    expect(campaign.html).toContain('No longer interested? <a href="{{unsubscribe_url}}">Unsubscribe →</a>');
  });

  it("renders plain text fallback with visible URLs", () => {
    const campaign = renderCampaignMarkdown(goodCampaign);

    expect(campaign.text).toContain("This is a link (https://example.com).");
    expect(campaign.text).toContain(
      "No longer interested? Unsubscribe → ({{unsubscribe_url}})",
    );
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

  it("validates the canonical campaign structure", () => {
    expect(validateCampaignMarkdown(goodCampaign.split("---\n\n")[1] ?? "")).toEqual([]);
    expect(validateCampaignMarkdown("Hello")).toContain('Campaign body must start with "Hey,".');
    expect(
      validateCampaignMarkdown(
        goodCampaign.replace(
          "You're receiving this because you subscribed to DJ Pardis.  \nNo longer interested?",
          "You're receiving this because you subscribed to DJ Pardis.\nNo longer interested?",
        ),
      ),
    ).toContain('Campaign footer must include "You\'re receiving this because you subscribed to <Name>.  \\nNo longer interested?"');
  });

  it("rejects em-dash subject lines", () => {
    expect(validateCampaignSubject("Smoke test — DJ Pardis")).toContain(
      "Campaign subject must not use an em dash. Write it like a news update.",
    );
    expect(() =>
      renderCampaignMarkdown(goodCampaign.replace('subject: "Test campaign"', 'subject: "Smoke test — DJ Pardis"')),
    ).toThrow("Campaign subject must not use an em dash");
  });

  it("expands the shared footer marker from the site campaign folder", () => {
    const root = mkdtempSync(join(tmpdir(), "newsletter-campaign-test-"));
    const campaignsDir = join(root, "campaigns");
    const templatesDir = join(campaignsDir, "_templates");
    mkdirSync(templatesDir, { recursive: true });
    writeFileSync(
      join(templatesDir, "footer.md"),
      "More soon.\n\n— DJ Pardis  \n*Your next set.*\n\nYou're receiving this because you subscribed to DJ Pardis.  \nNo longer interested? [Unsubscribe →]({{unsubscribe_url}})\n",
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
