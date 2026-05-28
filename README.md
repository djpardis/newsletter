# newsletter

A small HTTP API for running your own mailing list: double opt-in signups, one-click unsubscribe, campaign delivery, and bounce handling. The Worker runs on [Cloudflare](https://developers.cloudflare.com/workers/); subscriber and campaign state live in [D1](https://developers.cloudflare.com/d1/); outbound mail goes through [Resend](https://resend.com/).

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Requirements

- **Node** 20 or newer, for Wrangler and the campaign scripts
- **Cloudflare** account with Workers, D1, and Queues, plus the [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
- **Resend** account with a [verified sending domain](https://resend.com/docs/dashboard/domains/introduction)

## What to know before you start

- **No web UI.** Deploy with Wrangler, run list operations through the Bearer-protected HTTP API or the TypeScript scripts in `scripts/`, and implement signup on your site ([examples/](examples/)).
- **Campaign sends are async.** `POST /api/campaigns/send` queues delivery and responds right away with how many recipients were queued. It does not wait for Resend to accept or deliver each message.
- **No open or click tracking.** Opens and clicks are not tracked. Bounces and complaints update subscriber status in D1 only when Resend webhooks are enabled.
- **You own the list.** Subscriber data stays in your D1 database under your Cloudflare account.

## Deployment model

The checked-in `wrangler.toml` is for local development and uses placeholders only. Production deploys should use `.github/workflows/deploy.yml`, which generates `wrangler.generated.toml` from GitHub environment variables and secrets before applying migrations and deploying the Worker.

This keeps the project reusable across operators: each deployment gets its own Worker name, D1 database, queue, domain, sender, and secrets without committing operator-specific values. See [DEPLOYING.md](DEPLOYING.md) for the required environment variables and secrets.

Install, configuration, the HTTP API, and scripts: [SETUP.md](SETUP.md). Production deploy and webhooks: [DEPLOYING.md](DEPLOYING.md).

## Contributing and security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- License: [MIT](LICENSE)
