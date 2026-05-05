import { describe, expect, it } from "vitest";
import {
  campaignKindForType,
  previewWithUnsubscribeUrl,
  renderCampaignMarkdown,
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

— Future Shock Media
Boring on purpose.

You're receiving this because you subscribed to Future Shock Media. To stop, [unsubscribe here]({{unsubscribe_url}}).`;

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
    expect(campaign.html).toContain('<a href="{{unsubscribe_url}}">unsubscribe here</a>');
  });

  it("renders plain text fallback with visible URLs", () => {
    const campaign = renderCampaignMarkdown(goodCampaign);

    expect(campaign.text).toContain("This is a link (https://example.com).");
    expect(campaign.text).toContain(
      "You're receiving this because you subscribed to Future Shock Media. To stop, unsubscribe here ({{unsubscribe_url}}).",
    );
  });

  it("replaces unsubscribe placeholders in preview output", () => {
    const campaign = renderCampaignMarkdown(goodCampaign);
    const preview = previewWithUnsubscribeUrl(
      campaign,
      "https://newsletter.example.com/api/unsubscribe?token=U",
    );

    expect(preview.html).toContain(
      '<a href="https://newsletter.example.com/api/unsubscribe?token=U">unsubscribe here</a>',
    );
    expect(preview.text).toContain(
      "unsubscribe here (https://newsletter.example.com/api/unsubscribe?token=U).",
    );
  });

  it("validates the canonical campaign structure", () => {
    expect(validateCampaignMarkdown(goodCampaign.split("---\n\n")[1] ?? "")).toEqual([]);
    expect(validateCampaignMarkdown("Hello")).toContain('Campaign body must start with "Hey,".');
  });

  it("maps campaign types to supported Worker campaign kinds", () => {
    expect(campaignKindForType("update")).toBe("manual");
    expect(campaignKindForType("episode")).toBe("new_show");
    expect(campaignKindForType("other")).toBe("manual");
  });
});
