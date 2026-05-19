# newsletter

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <img src="assets/hero.png" width="560" alt="" />
</p>

A small HTTP API for running your own mailing list: double opt-in signups, one-click unsubscribe, campaign delivery, and bounce handling. Runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with subscribers in [D1](https://developers.cloudflare.com/d1/) and email via [Resend](https://resend.com/).

## Requirements

- **Node** 20 or newer (for Wrangler and scripts)
- **Cloudflare** account with Workers, D1, and Queues — [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
- **Resend** account with a [verified sending domain](https://resend.com/docs/dashboard/domains/introduction)

## What to know before you start

- **No web UI.** You configure the Worker, call HTTP endpoints, and use CLI scripts. Signup forms live on your own site ([examples/](examples/)).
- **Campaign sends are async.** `POST /api/campaigns/send` enqueues delivery; there is no per-recipient confirmation in that response.
- **No open or click tracking.** Bounces and complaints are handled via Resend webhooks when configured.
- **You own the list.** Subscriber data is in your D1 database; you run the stack yourself.

Full install, env vars, API reference, and scripts: [SETUP.md](SETUP.md). Production deploy: [DEPLOYING.md](DEPLOYING.md).

## Contributing and security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- License: [MIT](LICENSE)
