# Newsletter service

Newsletter backend that runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), stores subscribers in [D1](https://developers.cloudflare.com/d1/), and sends via [Resend](https://resend.com/). Supports double opt-in, [RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058) one-click unsubscribe, bounce and complaint handling via webhooks, and plain-text-first campaign delivery through [Cloudflare Queues](https://developers.cloudflare.com/queues/).

Campaign sends are async and queue-backed. There is no synchronous delivery confirmation and no open/click tracking. Resend's API throughput is the practical ceiling; the queue consumer retries transient failures automatically. Sends are triggered via CLI or API, not scheduled.

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

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

Full deployment checklist: [`DEPLOYING.md`](DEPLOYING.md).

## Configuration

Set secrets with `npx wrangler secret put <NAME>`. Set vars in `wrangler.toml` `[vars]`.

| Name | Required | Purpose |
|------|----------|---------|
| `RESEND_API_KEY` | yes | Resend API key |
| `ADMIN_BEARER_TOKEN` | yes | Bearer token for admin endpoints |
| `FROM_EMAIL` | yes | Sender address (`Name <email@domain>`) |
| `BASE_URL` | yes | Public Worker URL (no trailing slash) |
| `RESEND_WEBHOOK_SECRET` | optional | Enables `/api/webhooks/resend` |
| `TURNSTILE_SECRET_KEY` | optional | Requires Cloudflare Turnstile on subscribe |
| `SITE_URL` | optional | Website URL for redirects and email links; falls back to `BASE_URL` |
| `CORS_ORIGIN` | optional | Allowed origin for `/api/subscribe` |
| `SITE_NAME` | optional | Brand name in emails (default: `Newsletter`) |
| `COMPANY_ADDRESS` | optional | Postal line in campaign footers (CAN-SPAM/CASL) |
| `UNSUBSCRIBE_MAILTO` | optional | Mailto address for `List-Unsubscribe` header |

See `.env.example` for a full checklist.

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Liveness check |
| `POST` | `/api/subscribe` | — | Subscribe; see `examples/` |
| `GET` | `/api/confirm` | — | Double opt-in confirmation |
| `GET`, `POST` | `/api/unsubscribe` | — | One-click unsubscribe (RFC 8058) |
| `POST` | `/api/campaigns/send` | Bearer | Enqueue campaign to active subscribers |
| `POST` | `/api/webhooks/resend` | Svix | Handle bounce and complaint events |
| `POST` | `/api/admin/delete` | Bearer | Hard-delete a subscriber (GDPR) |

## Scripts

```bash
npx tsx scripts/import-csv.ts <file.csv>   # import email[,status]
npx tsx scripts/export-csv.ts              # export subscribers as CSV
npx tsx scripts/create-campaign.ts --md post.md --slug s --subject "..." --kind manual
npx tsx scripts/send-campaign.ts           # trigger POST /api/campaigns/send
```

## Contributing & security

- Contributions: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Deployment: [`DEPLOYING.md`](DEPLOYING.md)
- Security disclosures: [`SECURITY.md`](SECURITY.md)
- License: [MIT](LICENSE)
