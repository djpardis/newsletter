/**
 * Trigger send for a campaign via the Worker API.
 *
 * Usage:
 *   NEWSLETTER_API_URL=https://newsletter.example.com ADMIN_BEARER_TOKEN=secret npx tsx scripts/send-campaign.ts --id <uuid>
 *   # or inline payload (creates + sends):
 *   npx tsx scripts/send-campaign.ts --slug S --subject S --kind manual --html "<p>x</p>" --text "x"
 */
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

  const id = arg("--id");
  let body: Record<string, string | undefined>;
  if (id) {
    body = { campaign_id: id };
  } else {
    const slug = arg("--slug");
    const subject = arg("--subject");
    const kind = arg("--kind");
    const html = arg("--html");
    const text = arg("--text");
    if (!slug || !subject || !kind || !html || !text) {
      console.error("Provide --id or full inline flags.");
      process.exit(1);
    }
    body = { slug, subject, kind, html_body: html, text_body: text };
  }

  const res = await fetch(`${base}/api/campaigns/send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const textOut = await res.text();
  console.log(textOut);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
