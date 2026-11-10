# Deploying

## Provision and deploy

1. Create the database with `npx wrangler d1 create newsletter` and copy the
   printed `database_id` into the `[[d1_databases]]` block of `wrangler.toml`.
2. Set `FROM_EMAIL` and `BASE_URL` in `[vars]`. `FROM_EMAIL` must use a domain
   verified in Resend, and `BASE_URL` is the public URL of the Worker, without
   a trailing slash. See [SETUP.md](SETUP.md#configuration) for the optional
   variables.
3. Optionally create a queue with `npx wrangler queues create newsletter-send`
   and uncomment the `[[queues.producers]]` and `[[queues.consumers]]` blocks.
   Without the queue binding, campaign sends run inline from the request.
4. Apply migrations and deploy:

```bash
npx wrangler d1 migrations apply newsletter --remote
npm run deploy
```

5. Set the required secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_BEARER_TOKEN
npx wrangler secret put TURNSTILE_SECRET_KEY    # optional
```

`wrangler secret put` reads the value from a hidden prompt. In a
non-interactive shell, such as a script or a coding agent, the prompt receives
no input and Wrangler uploads an empty value. Pipe the value in or use the
Cloudflare dashboard in that case.

6. Check `GET {BASE_URL}/health`, then subscribe from your site and confirm the
   confirmation email arrives.

`npm run deploy` stamps the current commit as `DEPLOY_SHA`, so the running
Worker reports its source at `GET /health` (`{ "sha": "<short-sha>" }`). When
you keep operator config in a separate file, point at it with
`WRANGLER_CONFIG`:

```bash
WRANGLER_CONFIG=wrangler.<operator>.toml npm run deploy
```

## Bounce and complaint webhooks

Add a Resend webhook at `{BASE_URL}/api/webhooks/resend` for `email.bounced`
and `email.complained`, then set its signing secret:

```bash
npx wrangler secret put RESEND_WEBHOOK_SECRET
```

Backfill existing subscribers with `npx tsx scripts/import-csv.ts <file.csv>`.

## Rate limiting

`/api/subscribe` uses the Cloudflare rate limiting binding named
`SUBSCRIBE_RATE_LIMITER` when it is configured, and a D1-backed limiter
otherwise. The commented `[[ratelimits]]` block in `wrangler.toml` shows the
binding shape.

## Keeping the deployed Worker in sync

Deploys are manual, so the live Worker can lag behind `main`. Template, footer,
`[vars]`, and code changes take effect only after a deploy. Two safeguards make
a stale Worker visible:

- `GET /health` returns the deployed commit as `{ "sha": "<short-sha>" }`.
- The send scripts (`send-test.ts`, `send-campaign.ts`) compare that SHA to the
  local `git HEAD` and refuse to send to a stale Worker. Deploy first, or pass
  `--skip-version-check` to override.

```bash
curl -s "$NEWSLETTER_API_URL/health"   # compare "sha" to: git rev-parse --short HEAD
```

## CI

`.github/workflows/ci.yml` runs the public identifier and docs checks,
`typecheck`, `lint`, the unit tests, the local smoke test, and a gitleaks scan
of the full history on every push and pull request.
