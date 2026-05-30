# Deploying

Provision a Cloudflare D1 database and queue, verify the sending domain in
Resend, then fill in `wrangler.toml` with your values and run:

```bash
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
npx wrangler deploy
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

## CI

`.github/workflows/ci.yml` runs `typecheck`, `lint`, and `vitest` on every push and pull request.
