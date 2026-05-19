# newsletter

[![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)](https://github.com/djpardis/newsletter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <img src="assets/hero.png" width="560" alt="" />
</p>

Newsletter backend that runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), stores subscribers in [D1](https://developers.cloudflare.com/d1/), and sends via [Resend](https://resend.com/). Supports double opt-in, [RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058) one-click unsubscribe, automatic bounce and complaint suppression, and plain-text-first campaign delivery through [Cloudflare Queues](https://developers.cloudflare.com/queues/).

Campaign sends are async and queue-backed. There is no synchronous delivery confirmation and no open/click tracking. Resend's API throughput is the practical ceiling; the queue consumer retries transient failures automatically. Sends are triggered via CLI or API, not scheduled.

**Setup:** [SETUP.md](SETUP.md) (install, configuration, scripts). **Deploy:** [DEPLOYING.md](DEPLOYING.md). **Integrate a signup form:** [examples/](examples/).

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Liveness check |
| `POST` | `/api/subscribe` | — | Subscribe; see [examples/](examples/) |
| `GET` | `/api/confirm` | — | Double opt-in confirmation |
| `GET`, `POST` | `/api/unsubscribe` | — | One-click unsubscribe (RFC 8058) |
| `POST` | `/api/campaigns/send` | Bearer | Enqueue campaign to active subscribers |
| `POST` | `/api/campaigns/test-send` | Bearer | Send one campaign to one test recipient |
| `POST` | `/api/webhooks/resend` | Svix | Handle bounce and complaint events |
| `POST` | `/api/admin/delete` | Bearer | Hard-delete a subscriber (GDPR) |
| `POST` | `/api/admin/weekly-digest/test-send` | Bearer | Send the weekly operator digest immediately |

## Contributing & security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security disclosures: [SECURITY.md](SECURITY.md)
- License: [MIT](LICENSE)
