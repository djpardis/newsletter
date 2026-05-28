# Deploying

Production deploys run through `.github/workflows/deploy.yml`. Run the workflow
and select the GitHub environment for that deployment.

Provision the Cloudflare D1 database and queue, verify the sending domain in
Resend, then populate the GitHub environment variables and secrets below. The
workflow generates `wrangler.generated.toml`, applies D1 migrations, deploys the
Worker, syncs secrets, and checks `GET {BASE_URL}/health`.

After deploy, add the Resend webhook at
`{BASE_URL}/api/webhooks/resend` for `email.bounced` and
`email.complained`, then set the signing secret as `RESEND_WEBHOOK_SECRET`.
Backfill existing subscribers with `npx tsx scripts/import-csv.ts <file.csv>`.

### Local dev with queues

Queues are not available in `wrangler dev` without `--remote`. For local testing of campaign sends, the Worker falls back to the inline send loop when `SEND_QUEUE` is not bound (e.g. running `wrangler dev` against a local D1). Use `wrangler dev --remote` to test the queue path end-to-end.

## CI/CD

- `.github/workflows/ci.yml` — runs `typecheck`, `lint`, and `vitest` on every push and pull request.
- `.github/workflows/deploy.yml` — manual deploy; generates a Wrangler config
  from GitHub environment variables, applies D1 migrations, deploys, syncs
  Worker secrets, then checks `/health`.

Create one GitHub **Environment** per operator/deployment. Store real domains,
sender addresses, database IDs, queue names, and notification recipients in that
environment, not in the repository.

Required environment variables:

- `WORKER_NAME`
- `D1_DATABASE_NAME`
- `D1_DATABASE_ID`
- `SEND_QUEUE_NAME`
- `FROM_EMAIL`
- `BASE_URL`

Common optional environment variables:

- `WORKER_CUSTOM_DOMAIN`
- `SITE_URL`
- `SITE_NAME`
- `SITE_TAGLINE`
- `CORS_ORIGIN`
- `COMPANY_ADDRESS`
- `UNSUBSCRIBE_MAILTO`
- `NOTIFY_EMAIL`
- `DIGEST_EMAIL`
- `CRON_SCHEDULE`
- `WORKERS_DEV`
- `PREVIEW_URLS`

`CORS_ORIGIN` may contain a comma-separated allowlist. For local testing, add
`http://localhost:*` and `http://127.0.0.1:*` alongside the production site
origin.

Optional rate limit variables:

- `RATE_LIMIT_NAMESPACE_ID`
- `RATE_LIMIT_LIMIT`
- `RATE_LIMIT_PERIOD`

Required repository or environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `RESEND_API_KEY`
- `ADMIN_BEARER_TOKEN`

Optional secrets:

- `RESEND_WEBHOOK_SECRET`
- `TURNSTILE_SECRET_KEY`
