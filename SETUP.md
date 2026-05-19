# Setup

## Requirements

- **Node** ≥ 20
- **Cloudflare** account — install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and run `npx wrangler login`
- **Resend** account — [verify a sending domain](https://resend.com/docs/dashboard/domains/introduction) and create an API key

## Install

```bash
npm install
npx wrangler d1 create newsletter          # paste database_id into wrangler.toml
npx wrangler queues create newsletter-send
npx wrangler d1 migrations apply newsletter --remote
```

Local development:

```bash
npx wrangler d1 migrations apply newsletter --local && npm run dev
```

Production checklist: [DEPLOYING.md](DEPLOYING.md).

## Configuration

Bind each `env.<NAME>` from Cloudflare **Secrets** (`npx wrangler secret put <NAME>`) or **Variables** (`wrangler.toml` `[vars]` / dashboard). Runtime behavior is the same; Secrets stay out of tracked config.

| Name | Required | Set with | Purpose |
|------|----------|----------|---------|
| `RESEND_API_KEY` | yes | `secret put` | Resend API key |
| `ADMIN_BEARER_TOKEN` | yes | `secret put` | Bearer token for admin endpoints |
| `FROM_EMAIL` | yes | `[vars]` | Sender address (`Name <email@domain>`) |
| `BASE_URL` | yes | `[vars]` | Public Worker URL (no trailing slash) |
| `NOTIFY_EMAIL` | optional | `[vars]` | Operator email on new subscriber or reactivation |
| `DIGEST_EMAIL` | optional | `[vars]` | Weekly digest recipient; falls back to `NOTIFY_EMAIL` |
| `RESEND_WEBHOOK_SECRET` | optional | `secret put` | Enables `/api/webhooks/resend` |
| `TURNSTILE_SECRET_KEY` | optional | `secret put` | Requires Cloudflare Turnstile on subscribe |
| `SITE_URL` | optional | `[vars]` | Website URL for redirects and email links; falls back to `BASE_URL` |
| `CORS_ORIGIN` | optional | `[vars]` | Allowed origin for `/api/subscribe` |
| `SITE_NAME` | optional | `[vars]` | Brand name in emails (default: `Newsletter`) |
| `COMPANY_ADDRESS` | optional | `[vars]` | Postal line in campaign footers (CAN-SPAM/CASL) |
| `UNSUBSCRIBE_MAILTO` | optional | `[vars]` | Mailto address for `List-Unsubscribe` header |

See `.env.example` for a checklist.

## Subscriber notifications

When `NOTIFY_EMAIL` is configured, the Worker sends a transactional operator email only when the `subscribers` table changes for a real record:

- new row inserted (`subscribe_created`)
- existing unsubscribed row reactivated (`subscribe_reactivated`)

Honeypot hits, already-active subscribers, and pending confirmation resends do not notify.

## Weekly operator digest

When `DIGEST_EMAIL` is set, the scheduled Worker sends a plain-text digest every Monday UTC. If unset, it uses `NOTIFY_EMAIL`; if neither is set, no digest is sent.

Subject format: `<Site Name> (<Start date> - <End date>)`.

The digest covers the previous 7 days: new and reactivated subscribers, unsubscribes, bounces, complaints, net change, status totals, campaigns with sent/failed counts, top sources, and pending confirmations older than 48 hours.

Gmail and Googlemail addresses are shown in canonical form (dots and `+tag` aliases removed from the local part).

## Scripts

```bash
npx tsx scripts/import-csv.ts <file.csv>   # import email[,status]
npx tsx scripts/export-csv.ts              # export subscribers as CSV
npx tsx scripts/create-campaign.ts --md post.md --slug s --subject "..." --kind manual
npx tsx scripts/send-test-campaign.ts      # POST /api/campaigns/test-send
npx tsx scripts/send-campaign.ts           # POST /api/campaigns/send (requires --reviewed)
```

Create a campaign from reviewed Markdown, send a one-off test with `send-test-campaign.ts`, then production send with `send-campaign.ts --reviewed`. Test sends do not update campaign delivery metrics; recipients still get real unsubscribe links.
