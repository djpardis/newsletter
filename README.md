# newsletter

<p align="center">
  <img src="assets/hero.png" width="560" alt="" />
</p>

A small HTTP API for running your own mailing list: double opt-in signups, one-click unsubscribe, campaign delivery, and bounce handling. The Worker runs on [Cloudflare](https://developers.cloudflare.com/workers/); subscriber and campaign state live in [D1](https://developers.cloudflare.com/d1/); outbound mail goes through [Resend](https://resend.com/).

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Requirements

- **Node** 22 or newer, for Wrangler and the campaign scripts
- **Cloudflare** account with Workers, D1, and Queues, plus the [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
- **Resend** account with a [verified sending domain](https://resend.com/docs/dashboard/domains/introduction)

## Operational notes

- **No web UI.** Deploy with Wrangler, run list operations through the Bearer-protected HTTP API or the TypeScript scripts in `scripts/`, and implement signup on your site ([examples/](examples/)).
- **Campaign sends are async.** `POST /api/campaigns/send` queues delivery and responds right away with how many recipients were queued. It does not wait for Resend to accept or deliver each message.
- **Review and send by email.** `request-approval.ts` emails the operator a review copy of a campaign with a one-time link, and the campaign goes to subscribers only after the operator presses send on that page ([Review and send by email](SETUP.md#review-and-send-by-email)).
- **Optional welcome email.** Set `WELCOME_CAMPAIGN_SLUG` to send a reviewed campaign to each subscriber after they confirm.
- **Campaigns follow a house style by default.** The scripts refuse a campaign that does not open with "Hey," and end with the shared footer. Start from [examples/campaigns/](examples/campaigns/), or replace the rules with your own `rules.json` ([Campaign style](SETUP.md#campaign-style)).
- **No open or click tracking.** Opens and clicks are not tracked. Bounces and complaints update subscriber status in D1 only when Resend webhooks are enabled.
- **You own the list.** Subscriber data stays in your D1 database under your Cloudflare account.

Install, configuration, the HTTP API, and scripts: [SETUP.md](SETUP.md). Production deploy and webhooks: [DEPLOYING.md](DEPLOYING.md).

## Contributing and security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Coding agent instructions: [AGENTS.md](AGENTS.md)
- Security policy: [SECURITY.md](SECURITY.md)
- License: [MIT](LICENSE)
