/**
 * Send one reviewed campaign to one test recipient via the Worker API.
 *
 * Usage:
 *   NEWSLETTER_API_URL=https://newsletter.example.com ADMIN_BEARER_TOKEN=secret npx tsx scripts/send-test-campaign.ts --id <uuid> --to person@example.com
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
  const to = arg("--to");
  if (!id || !to) {
    console.error("Provide --id and --to. Create and review campaigns before test-sending.");
    process.exit(1);
  }

  const res = await fetch(`${base}/api/campaigns/test-send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ campaign_id: id, email: to }),
  });
  const textOut = await res.text();
  console.log(textOut);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
