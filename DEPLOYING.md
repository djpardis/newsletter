# Deploying

1. `npm install`, then `npx wrangler login`.
2. `npx wrangler d1 create newsletter` and paste the `database_id` into `wrangler.toml`.
3. `npx wrangler d1 migrations apply newsletter --remote`.
4. Verify the sending domain in Resend (DKIM/SPF DNS records); create an API key.
5. Set secrets:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ADMIN_BEARER_TOKEN
   npx wrangler secret put RESEND_WEBHOOK_SECRET
   ```
6. Set vars in `wrangler.toml` `[vars]` or the Cloudflare dashboard: `FROM_EMAIL`, `BASE_URL`, `SITE_URL`, `CORS_ORIGIN`, `SITE_NAME`. Optional: `COMPANY_ADDRESS`, `UNSUBSCRIBE_MAILTO`. See `.env.example`.
7. `npm run deploy` and check `GET {BASE_URL}/health`.
8. In Resend, add a webhook → URL `{BASE_URL}/api/webhooks/resend`, events `email.bounced` and `email.complained`; paste the signing secret into `RESEND_WEBHOOK_SECRET`.
9. Backfill any existing list with `npx tsx scripts/import-csv.ts <file.csv>`.
10. Wire your site's signup form to `POST {BASE_URL}/api/subscribe`. See `examples/`.

## CI/CD

- `.github/workflows/ci.yml` — runs `typecheck`, `lint`, and `vitest` on every push and pull request.
- `.github/workflows/deploy.yml` — manual `workflow_dispatch`; applies D1 migrations then deploys. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.
