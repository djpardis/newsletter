# newsletter

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <img src="assets/hero.png" width="560" alt="" />
</p>

A small HTTP API for running your own mailing list: double opt-in signups, one-click unsubscribe, campaign delivery, and bounce handling. Runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with subscribers in [D1](https://developers.cloudflare.com/d1/) and email via [Resend](https://resend.com/).

Campaign sends are async ([Cloudflare Queues](https://developers.cloudflare.com/queues/)); there is no dashboard and no open or click tracking. You wire your site to `POST /api/subscribe`, write campaigns in Markdown, and send from the CLI.

## Documentation

| Doc | What it covers |
|-----|----------------|
| [SETUP.md](SETUP.md) | Install, configuration, HTTP API, scripts |
| [DEPLOYING.md](DEPLOYING.md) | Production deploy and webhooks |
| [examples/](examples/) | Signup form integration |

## Contributing and security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security disclosures: [SECURITY.md](SECURITY.md)
- License: [MIT](LICENSE)
