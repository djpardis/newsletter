# Deploying

1. `npm install`, then `npx wrangler login`.
2. `npx wrangler d1 create newsletter` and paste the `database_id` into `wrangler.toml`.
3. `npx wrangler queues create newsletter-send` (required for campaign delivery).
4. `npx wrangler d1 migrations apply newsletter --remote`.
5. Verify the sending domain in Resend (DKIM/SPF DNS records); create an API key.
6. Set secrets:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ADMIN_BEARER_TOKEN
   npx wrangler secret put RESEND_WEBHOOK_SECRET
   ```
7. Set vars in `wrangler.toml` `[vars]` or the Cloudflare dashboard: `FROM_EMAIL`, `BASE_URL`, `SITE_URL`, `CORS_ORIGIN`, `SITE_NAME`. Optional: `COMPANY_ADDRESS`, `UNSUBSCRIBE_MAILTO`. See `.env.example`.
8. `npm run deploy` and check `GET {BASE_URL}/health`.
9. In Resend, add a webhook → URL `{BASE_URL}/api/webhooks/resend`, events `email.bounced` and `email.complained`; paste the signing secret into `RESEND_WEBHOOK_SECRET`.
10. Backfill any existing list with `npx tsx scripts/import-csv.ts <file.csv>`.
11. Wire your site's signup form to `POST {BASE_URL}/api/subscribe`. See `examples/`.

### Local dev with queues

Queues are not available in `wrangler dev` without `--remote`. For local testing of campaign sends, the Worker falls back to the inline send loop when `SEND_QUEUE` is not bound (e.g. running `wrangler dev` against a local D1). Use `wrangler dev --remote` to test the queue path end-to-end.

## CI/CD

- `.github/workflows/ci.yml` — runs `typecheck`, `lint`, and `vitest` on every push and pull request.
- `.github/workflows/deploy.yml` — manual `workflow_dispatch`; generates a
  Wrangler config from GitHub environment variables, applies D1 migrations,
  deploys, syncs Worker secrets, then checks `/health`.

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
