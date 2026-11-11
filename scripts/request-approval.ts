/**
 * Render a Markdown campaign and email a review copy with a one-time
 * "Review and send" link. Nothing goes to subscribers until the reviewer
 * opens the link and presses the send button.
 *
 * Usage:
 *   NEWSLETTER_API_URL=https://newsletter.example.com ADMIN_BEARER_TOKEN=secret \
 *     npx tsx scripts/request-approval.ts --md campaigns/issue-12.md [--to reviewer@example.com] [--refresh]
 *
 * The reviewer defaults to REVIEW_EMAIL, then REPLY_TO, on the Worker. A slug
 * that already has a campaign is skipped unless --refresh is passed, which
 * replaces an unsent campaign's content and sends a new review link.
 */
import { CampaignStyleError, renderCampaignMarkdownFile } from "./lib/campaign-content.js";
import { assertWorkerUpToDate } from "./lib/version-guard.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const base = process.env.NEWSLETTER_API_URL?.replace(/\/$/, "");
  const token = process.env.ADMIN_BEARER_TOKEN;
  if (!base || !token) {
    console.error("Set NEWSLETTER_API_URL and ADMIN_BEARER_TOKEN");
    process.exit(1);
  }
  const mdFile = arg("--md");
  if (!mdFile) {
    console.error("Usage: npx tsx scripts/request-approval.ts --md campaign.md [--to address] [--refresh]");
    process.exit(1);
  }

  let campaign;
  try {
    campaign = renderCampaignMarkdownFile(mdFile);
  } catch (e) {
    console.error(e instanceof CampaignStyleError ? e.message : e);
    process.exit(1);
  }

  await assertWorkerUpToDate(base, { skip: process.argv.includes("--skip-version-check") });

  const res = await fetch(`${base}/api/campaigns/request-approval`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      slug: campaign.slug,
      subject: campaign.subject,
      kind: campaign.kind,
      html_body: campaign.html,
      text_body: campaign.text,
      email: arg("--to"),
      refresh: process.argv.includes("--refresh"),
    }),
  });
  const out = await res.text();
  console.log(out);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
