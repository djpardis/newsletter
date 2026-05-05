/**
 * Preview a campaign Markdown file without creating or sending anything.
 *
 * Usage:
 *   npx tsx scripts/preview-campaign.ts --md ../107wins/campaigns/updates/issue-12.md
 */
import {
  previewWithUnsubscribeUrl,
  renderCampaignMarkdownFile,
} from "./lib/campaign-content.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function main() {
  const mdFile = arg("--md");
  if (!mdFile) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/preview-campaign.ts --md campaign.md [--slug S] [--subject S] [--type update|episode|other] [--kind manual|new_post|new_show] [--unsubscribe-url URL]",
    );
    process.exit(1);
  }

  const campaign = renderCampaignMarkdownFile(mdFile, {
    slug: arg("--slug"),
    subject: arg("--subject"),
    type: arg("--type"),
    kind: arg("--kind"),
  });
  const preview = previewWithUnsubscribeUrl(
    campaign,
    arg("--unsubscribe-url") ?? "https://newsletter.example.com/api/unsubscribe?token=PREVIEW",
  );

  console.log(`# ${campaign.subject}`);
  console.log("");
  console.log(`slug: ${campaign.slug}`);
  console.log(`type: ${campaign.type}`);
  console.log(`kind: ${campaign.kind}`);
  console.log("");
  console.log("## Plain Text");
  console.log("");
  console.log(preview.text);
  console.log("");
  console.log("## HTML");
  console.log("");
  console.log(preview.html);
}

main();
