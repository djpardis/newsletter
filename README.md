# Newsletter service

Cloudflare Worker API for double opt-in subscriptions, list unsubscribe, and campaign delivery via Resend. Data lives in D1.

## Requirements

- Node 20+
- Cloudflare account, [Wrangler](https://developers.cloudflare.com/workers/wrangler/) authenticated (`npx wrangler login`)
- [Resend](https://resend.com/) API key and verified sending domain

## Setup

```bash
npm install
```

Create the database and record its id in `wrangler.toml` (`database_id`):

```bash
npx wrangler d1 create newsletter
```

Apply schema to the remote database:

```bash
npx wrangler d1 migrations apply newsletter --remote
```

For local development:

```bash
npx wrangler d1 migrations apply newsletter --local
npm run dev
```

## Configuration

| Name | Type | Purpose |
|------|------|---------|
| `RESEND_API_KEY` | secret | Resend API authorization |
| `ADMIN_BEARER_TOKEN` | secret | Bearer for admin endpoints (campaign send, delete) |
| `RESEND_WEBHOOK_SECRET` | secret (optional) | Required to enable `/api/webhooks/resend` |
| `TURNSTILE_SECRET_KEY` | secret (optional) | If set, subscribe requires Turnstile |
| `FROM_EMAIL` | var | Resend From header |
| `BASE_URL` | var | Public Worker URL (no trailing slash); used for confirm/unsubscribe links |
| `SITE_URL` | var (optional) | Public website URL (no trailing slash). When set, `GET /` redirects here and email footers link here. Falls back to `BASE_URL`. |
| `CORS_ORIGIN` | var (optional) | Allowed browser `Origin` for `/api/subscribe` |
| `SITE_NAME` | var (optional) | Shown in confirmation subject; default “Newsletter” |
| `COMPANY_ADDRESS` | var (optional) | Postal line in footers. When unset/empty, the line is omitted. |
| `UNSUBSCRIBE_MAILTO` | var (optional) | Extra `List-Unsubscribe` mailto |

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_BEARER_TOKEN
```

Use `wrangler.toml` `[vars]` or the Cloudflare dashboard for non-secret variables. See `.env.example` for a checklist.

## HTTP API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Liveness |
| `OPTIONS`, `POST` | `/api/subscribe` | — | JSON subscribe; CORS preflight supported |
| `GET` | `/api/confirm` | — | Query `token`; double opt-in |
| `GET`, `POST` | `/api/unsubscribe` | — | Query `token`; RFC 8058 POST body supported |
| `POST` | `/api/campaigns/send` | `Authorization: Bearer <ADMIN_BEARER_TOKEN>` | Create-and-send or send by `campaign_id` |
| `POST` | `/api/webhooks/resend` | Svix signature | Marks bounced/complained from Resend events |
| `POST` | `/api/admin/delete` | `Authorization: Bearer <ADMIN_BEARER_TOKEN>` | Hard-delete a subscriber by email (GDPR) |

### Subscribe request

`POST /api/subscribe` with `Content-Type: application/json`:

```json
{
  "email": "user@example.com",
  "source": "website"
}
```

Optional: `metadata` (object), `turnstile_token` (if Turnstile is enabled server-side).

**Honeypot:** include a hidden field; it must be empty or omitted. Recognized keys are listed in `worker/src/lib/validation.ts` (`website`, `url`, `company`, `hp`, `address`). A non-empty value yields `200 { "ok": true }` without subscribing.

## Operator scripts

Run from the repo root. Remote D1 requires a configured `database_id` and Cloudflare auth.

| Script | Purpose |
|--------|---------|
| `npx tsx scripts/import-csv.ts <file.csv>` | Import `email[,status]` (set `NEWSLETTER_D1_NAME` if not `newsletter`) |
| `npx tsx scripts/export-csv.ts` | Export subscriber rows as CSV |
| `npx tsx scripts/create-campaign.ts` | Create a campaign row (`--slug`, `--subject`, `--kind`, `--html`, `--text`) |
| `npx tsx scripts/send-campaign.ts` | Call deployed `POST /api/campaigns/send` (`NEWSLETTER_API_URL`, `ADMIN_BEARER_TOKEN`) |

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run deploy
```

## Scheduled jobs

A daily cron (`wrangler.toml` `[triggers]`) calls `runCleanup`: prunes expired rate limit rows, used or expired confirmation tokens older than 7 days, and audit events older than 1 year.

## Continuous integration

GitHub Actions:

- `.github/workflows/ci.yml` — runs `typecheck`, `lint`, and `vitest` on every push and pull request.
- `.github/workflows/deploy.yml` — manual `workflow_dispatch` job that applies remote D1 migrations and deploys the Worker. Requires repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Launch checklist

1. `npm install`, then `npx wrangler login`.
2. `npx wrangler d1 create newsletter` and paste the `database_id` into `wrangler.toml`.
3. `npx wrangler d1 migrations apply newsletter --remote`.
4. Verify the sending domain in Resend (DKIM/SPF DNS records); create an API key.
5. Set secrets:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ADMIN_BEARER_TOKEN
   # Recommended for deliverability hygiene:
   npx wrangler secret put RESEND_WEBHOOK_SECRET
   ```
6. Set vars (in `wrangler.toml` `[vars]` or the dashboard): `FROM_EMAIL`, `BASE_URL`, `SITE_URL`, `CORS_ORIGIN`, `SITE_NAME`, `COMPANY_ADDRESS`, optional `UNSUBSCRIBE_MAILTO`.
7. `npm run deploy` and check `GET {BASE_URL}/health`.
8. In Resend, add a webhook → URL `{BASE_URL}/api/webhooks/resend`, events `email.bounced`, `email.complained`; copy the signing secret into `RESEND_WEBHOOK_SECRET`.
9. Backfill any existing list with `scripts/import-csv.ts`.
10. Wire your site’s signup form to `POST {BASE_URL}/api/subscribe`.

## Layout

| Path | Role |
|------|------|
| `worker/src/index.ts` | Router and scheduled handler |
| `worker/src/routes/` | HTTP handlers |
| `worker/src/lib/` | Email, validation, rate limits, signatures, cleanup |
| `migrations/` | D1 SQL |
| `scripts/` | CLI tools |
| `.github/workflows/` | CI and deploy |
