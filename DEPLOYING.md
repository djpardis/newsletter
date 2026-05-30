# Deploying

Provision a Cloudflare D1 database and queue, verify the sending domain in
Resend, then fill in `wrangler.toml` with your values and run:

```bash
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
npm run deploy
```

`npm run deploy` stamps the current commit as `DEPLOY_SHA` so the running
Worker reports its source at `GET /health` (`{ "sha": "<short-sha>" }`). When you
keep operator config in a non-default file, point at it with `WRANGLER_CONFIG`:

```bash
WRANGLER_CONFIG=wrangler.<operator>.toml npm run deploy
```

After deploy, add the Resend webhook at
`{BASE_URL}/api/webhooks/resend` for `email.bounced` and
`email.complained`, then set the signing secret:

```bash
npx wrangler secret put RESEND_WEBHOOK_SECRET
```

Backfill existing subscribers with `npx tsx scripts/import-csv.ts <file.csv>`.

## Required `wrangler.toml` vars

- `WORKER_NAME`
- `D1_DATABASE_NAME`
- `D1_DATABASE_ID`
- `SEND_QUEUE_NAME`
- `FROM_EMAIL`
- `BASE_URL`

Common optional:

- `WORKER_CUSTOM_DOMAIN`
- `SITE_URL`, `SITE_NAME`, `SITE_TAGLINE`
- `CORS_ORIGIN` — comma-separated allowlist; add `http://localhost:*` for local dev
- `COMPANY_ADDRESS`, `UNSUBSCRIBE_MAILTO`, `REPLY_TO`
- `NOTIFY_EMAIL`, `DIGEST_EMAIL`
- `CRON_SCHEDULE`
- `WORKERS_DEV`, `PREVIEW_URLS`

Optional rate limit vars:

- `RATE_LIMIT_NAMESPACE_ID`, `RATE_LIMIT_LIMIT`, `RATE_LIMIT_PERIOD`

## Required secrets

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_BEARER_TOKEN
npx wrangler secret put RESEND_WEBHOOK_SECRET   # optional
npx wrangler secret put TURNSTILE_SECRET_KEY    # optional
```

## Local dev with queues

Queues are not available in `wrangler dev` without `--remote`. For local testing of campaign sends, the Worker falls back to the inline send loop when `SEND_QUEUE` is not bound. Use `wrangler dev --remote` to test the queue path end-to-end.

## Keeping the deployed Worker in sync

Deploys are manual, so the live Worker can lag behind `main` (template/footer,
`REPLY_TO`, and other `[vars]`/code changes only take effect after a deploy).
Two safeguards make staleness obvious:

- `GET /health` returns the deployed commit: `{ "sha": "<short-sha>" }`.
- The send scripts (`send-test.ts`, `send-campaign.ts`) run a preflight check
  that compares that SHA to local `git HEAD` and **refuse to send** against a
  stale Worker. Deploy first, or pass `--skip-version-check` to override.

Quick manual check:

```bash
curl -s "$NEWSLETTER_API_URL/health"   # compare "sha" to: git rev-parse --short HEAD
```

## CI

`.github/workflows/ci.yml` runs `typecheck`, `lint`, and `vitest` on every push and pull request.
