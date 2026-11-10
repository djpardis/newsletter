# Agent instructions

This repository is a Cloudflare Worker for a self-hosted mailing list. Human
docs are [README.md](README.md), [SETUP.md](SETUP.md), and
[DEPLOYING.md](DEPLOYING.md). Follow them in that order and do not invent steps
that they do not describe.

## Local setup

```bash
npm ci
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply newsletter --local
npm run dev
```

No Cloudflare account or Resend key is needed locally. With `RESEND_API_KEY`
blank, emails are printed to the `wrangler dev` log, including the confirmation
link.

## Checks

Run these before proposing a change. CI runs the same commands.

```bash
npm run check:public-identifiers
npm run check:docs
npm run typecheck
npm run lint
npm test
npm run smoke
```

## Deploying for a user

Follow [DEPLOYING.md](DEPLOYING.md) step by step.

- Copy the `database_id` printed by `wrangler d1 create` into the deployment's
  Wrangler config before applying remote migrations.
- Do not type secrets into a hidden `wrangler secret put` prompt from a
  non-interactive shell. The prompt receives no input and Wrangler uploads an
  empty value. Pipe the value in, or ask the user to set it in the Cloudflare
  dashboard.
- Do not curl, open, or `dig` a new custom domain before it is deployed.
  Resolvers cache the "does not exist" answer for up to 30 minutes, which
  breaks the signup form on that network after the deploy succeeds. Use
  `npm run verify`, which asks the authoritative nameservers.
- A deploy is done when `npm run verify -- --email <address>` passes and the
  confirmation email has arrived.

## Public repository rules

- Keep operator values out of tracked files: real email addresses, domains,
  account or database IDs, tokens, and local paths. Put them in an ignored
  config such as `wrangler.<operator>.toml` or `.dev.vars`, or in Cloudflare
  secrets. `npm run check:public-identifiers` enforces this.
- Use `example.com` addresses and placeholder IDs in docs, tests, and examples.
- Database migrations are forward-only. Add a new file under `migrations/`.
- The HTTP API and `Env` variable names are public surface. See
  [CONTRIBUTING.md](CONTRIBUTING.md).
