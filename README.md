# newsletter

![](assets/hero.png)

Newsletter backend that runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), stores subscribers in [D1](https://developers.cloudflare.com/d1/), and sends via [Resend](https://resend.com/). Supports double opt-in, [RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058) one-click unsubscribe, automatic bounce and complaint suppression, and plain-text-first campaign delivery through [Cloudflare Queues](https://developers.cloudflare.com/queues/).

Campaign sends are async and queue-backed. There is no synchronous delivery confirmation and no open/click tracking. Resend's API throughput is the practical ceiling; the queue consumer retries transient failures automatically. Sends are triggered via CLI or API, not scheduled.

[CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[License: MIT](LICENSE)

## Requirements

- **Node** ≥ 20
- **Cloudflare** account — install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and run `npx wrangler login`
- **Resend** account — [verify a sending domain](https://resend.com/docs/dashboard/domains/introduction) and create an API key

## Setup

```bash
npm install
npx wrangler d1 create newsletter          # paste database_id into wrangler.toml
npx wrangler queues create newsletter-send
npx wrangler d1 migrations apply newsletter --remote
```

Local development: `npx wrangler d1 migrations apply newsletter --local && npm run dev`

Full deployment checklist: `[DEPLOYING.md](DEPLOYING.md)`.

## Configuration

Bind each `env.<NAME>` from Cloudflare **Secrets** (`npx wrangler secret put <NAME>`) or **Variables** (`wrangler.toml` `[vars]` / dashboard). Runtime behavior is the same; Secrets stay out of tracked config. Keys and tokens should be Secrets; URLs and branding are often Variables—you can still put any name in Secrets if you prefer.


| Name                    | Required | Set with     | Purpose                                                                                        |
| ----------------------- | -------- | ------------ | ---------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`        | yes      | `secret put` | Resend API key                                                                                 |
| `ADMIN_BEARER_TOKEN`    | yes      | `secret put` | Bearer token for admin endpoints                                                               |
| `FROM_EMAIL`            | yes      | `[vars]`     | Sender address (`Name <email@domain>`)                                                         |
| `BASE_URL`              | yes      | `[vars]`     | Public Worker URL (no trailing slash)                                                          |
| `NOTIFY_EMAIL`          | optional | `[vars]`     | Operator email notified when a subscriber row is created or an unsubscribed row is reactivated |
| `DIGEST_EMAIL`          | optional | `[vars]`     | Weekly operator digest recipient; falls back to `NOTIFY_EMAIL`                                 |
| `RESEND_WEBHOOK_SECRET` | optional | `secret put` | Enables `/api/webhooks/resend`                                                                 |
| `TURNSTILE_SECRET_KEY`  | optional | `secret put` | Requires Cloudflare Turnstile on subscribe                                                     |
| `SITE_URL`              | optional | `[vars]`     | Website URL for redirects and email links; falls back to `BASE_URL`                            |
| `CORS_ORIGIN`           | optional | `[vars]`     | Allowed origin for `/api/subscribe`                                                            |
| `SITE_NAME`             | optional | `[vars]`     | Brand name in emails (default: `Newsletter`)                                                   |
| `COMPANY_ADDRESS`       | optional | `[vars]`     | Postal line in campaign footers (CAN-SPAM/CASL)                                                |
| `UNSUBSCRIBE_MAILTO`    | optional | `[vars]`     | Mailto address for `List-Unsubscribe` header                                                   |


See `.env.example` for a full checklist.

## Subscriber notifications

When `NOTIFY_EMAIL` is configured, the service sends a transactional operator
email only after the `subscribers` table changes for a real subscriber record:

- a new row is inserted (`subscribe_created`)
- an existing unsubscribed row is reactivated (`subscribe_reactivated`)

Invalid requests, honeypot submissions, already-active subscribers, and pending
confirmation resends do not trigger operator notifications.

## Weekly operator digest

When `DIGEST_EMAIL` is configured, the scheduled Worker sends a plain-text
transactional digest every Monday UTC. If `DIGEST_EMAIL` is unset, the digest
uses `NOTIFY_EMAIL`; if neither is configured, no digest is sent.

Digest subjects use the site name and reporting window:
`<Site Name> (<Start date> - <End date>)`.

The digest summarizes the previous 7 days:

- new active subscriber emails and reactivated subscribers
- unsubscribes, bounces, and complaints
- net subscriber change and current status totals
- campaigns sent with sent/failed delivery counts
- top subscription sources
- pending confirmations older than 48 hours

Subscriber lists are deduped for display. Gmail and Googlemail addresses are
shown in canonical form by removing dots and `+tag` aliases from the local part.

## API


| Method        | Path                                 | Auth   | Description                                      |
| ------------- | ------------------------------------ | ------ | ------------------------------------------------ |
| `GET`         | `/health`                            | —      | Liveness check                                   |
| `POST`        | `/api/subscribe`                     | —      | Subscribe; see `examples/`                       |
| `GET`         | `/api/confirm`                       | —      | Double opt-in confirmation                       |
| `GET`, `POST` | `/api/unsubscribe`                   | —      | One-click unsubscribe (RFC 8058)                 |
| `POST`        | `/api/campaigns/send`                | Bearer | Enqueue campaign to active subscribers           |
| `POST`        | `/api/campaigns/test-send`           | Bearer | Send one existing campaign to one test recipient |
| `POST`        | `/api/webhooks/resend`               | Svix   | Handle bounce and complaint events               |
| `POST`        | `/api/admin/delete`                  | Bearer | Hard-delete a subscriber (GDPR)                  |
| `POST`        | `/api/admin/weekly-digest/test-send` | Bearer | Send the weekly operator digest immediately      |


## Scripts

```bash
npx tsx scripts/import-csv.ts <file.csv>   # import email[,status]
npx tsx scripts/export-csv.ts              # export subscribers as CSV
npx tsx scripts/create-campaign.ts --md post.md --slug s --subject "..." --kind manual
npx tsx scripts/send-test-campaign.ts      # trigger POST /api/campaigns/test-send
npx tsx scripts/send-campaign.ts           # trigger POST /api/campaigns/send (requires --reviewed)
```

For campaigns, create a campaign row from reviewed Markdown first, send a one-off
test with `send-test-campaign.ts`, then send the production campaign with
`send-campaign.ts --reviewed`. Test sends do not update campaign delivery
metrics, but active subscriber recipients still receive real unsubscribe links.

## Contributing & security

- Contributions: `[CONTRIBUTING.md](CONTRIBUTING.md)`
- Deployment: `[DEPLOYING.md](DEPLOYING.md)`
- Security disclosures: `[SECURITY.md](SECURITY.md)`
- License: [MIT](LICENSE)

