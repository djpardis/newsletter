# Newsletter service

Cloudflare Worker API for double opt-in subscriptions, list unsubscribe, and campaign delivery via Resend. Data lives in D1.

A self-hosted alternative to MailerLite/Substack/Buttondown.

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Requirements

- Node 20+
- Cloudflare account, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) authenticated (`npx wrangler login`)
- [Resend](https://resend.com/) API key and verified sending domain

## Setup

```bash
npm install
npx wrangler d1 create newsletter   # paste the database_id into wrangler.toml
npx wrangler d1 migrations apply newsletter --remote
```

Local development: `npx wrangler d1 migrations apply newsletter --local && npm run dev`

First deployment: see [`DEPLOYING.md`](DEPLOYING.md).

## Configuration

| Name | Type | Purpose |
|------|------|---------|
| `RESEND_API_KEY` | secret | Resend API authorization |
| `ADMIN_BEARER_TOKEN` | secret | Bearer for admin endpoints |
| `RESEND_WEBHOOK_SECRET` | secret (optional) | Required to enable `/api/webhooks/resend` |
| `TURNSTILE_SECRET_KEY` | secret (optional) | If set, subscribe requires Turnstile |
| `FROM_EMAIL` | var | Resend From header |
| `BASE_URL` | var | Public Worker URL (no trailing slash) |
| `SITE_URL` | var (optional) | Public website URL. `GET /` redirects here; email links use this. Falls back to `BASE_URL`. |
| `CORS_ORIGIN` | var (optional) | Allowed browser `Origin` for `/api/subscribe` |
| `SITE_NAME` | var (optional) | Brand name in emails; default "Newsletter" |
| `COMPANY_ADDRESS` | var (optional) | Postal line in campaign email footers. Omitted when unset. |
| `UNSUBSCRIBE_MAILTO` | var (optional) | Extra `List-Unsubscribe` mailto |

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_BEARER_TOKEN
```

See `.env.example` for a full checklist.

## HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Liveness |
| `OPTIONS`, `POST` | `/api/subscribe` | — | JSON subscribe; see `examples/` |
| `GET` | `/api/confirm` | — | Query `token`; double opt-in |
| `GET`, `POST` | `/api/unsubscribe` | — | Query `token`; RFC 8058 POST supported |
| `POST` | `/api/campaigns/send` | Bearer | Send campaign to active subscribers |
| `POST` | `/api/webhooks/resend` | Svix signature | Handle bounce/complaint events |
| `POST` | `/api/admin/delete` | Bearer | Hard-delete a subscriber (GDPR) |

## Operator scripts

| Script | Purpose |
|--------|---------|
| `npx tsx scripts/import-csv.ts <file.csv>` | Import `email[,status]` |
| `npx tsx scripts/export-csv.ts` | Export subscribers as CSV |
| `npx tsx scripts/create-campaign.ts` | Create a campaign row |
| `npx tsx scripts/send-campaign.ts` | Trigger `POST /api/campaigns/send` |

A daily cron (`wrangler.toml` `[triggers]`) prunes expired tokens, rate-limit rows, and old audit events.

## Layout

| Path | Role |
|------|------|
| `worker/src/index.ts` | Router and scheduled handler |
| `worker/src/routes/` | HTTP handlers |
| `worker/src/lib/` | Email, validation, rate limits, signatures, cleanup |
| `migrations/` | D1 SQL |
| `scripts/` | CLI tools |
| `examples/` | Reference signup-form integration |
| `.github/workflows/` | CI and deploy |

## Contributing & security

- Contributions: see [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Deployment: see [`DEPLOYING.md`](DEPLOYING.md).
- Security disclosures: see [`SECURITY.md`](SECURITY.md).
- License: [MIT](LICENSE).
