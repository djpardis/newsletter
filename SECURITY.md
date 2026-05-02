# Security policy

This project handles email addresses, opt-in tokens, and bulk send credentials. We take vulnerability reports seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Use one of the following private channels:

- Preferred: [GitHub Security Advisories](https://github.com/djpardis/newsletter/security/advisories/new) on this repo.
- Alternative: open a minimal public issue titled "security contact request" (no details) and we will follow up privately.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, or a proof-of-concept. Use placeholder data — never real subscriber emails or tokens.
- Affected commit SHA or release tag.

We aim to acknowledge reports within 3 business days and to ship a fix or mitigation within 30 days for high/critical issues. We will credit reporters in the release notes unless you prefer otherwise.

## Scope

In scope:

- Code in this repository (Worker routes, libraries, migrations, scripts, CI workflows).
- Documented HTTP API behavior (`/api/*`).
- Email template generation, including `List-Unsubscribe` and `List-Unsubscribe-Post` header construction.

Out of scope:

- Vulnerabilities in third-party services this project depends on (Cloudflare Workers/D1, Resend). Report those directly to the vendor.
- Issues that require a malicious operator with valid `ADMIN_BEARER_TOKEN` or Cloudflare account access.
- Denial of service that requires sustained traffic above the per-IP subscribe rate limit and Cloudflare's own protections.

## Hardening guidance for operators

Even without a vulnerability, operators should:

- Rotate `ADMIN_BEARER_TOKEN` and `RESEND_API_KEY` periodically and on staff turnover.
- Enable `RESEND_WEBHOOK_SECRET` so bounce/complaint events are signature-verified.
- Set `CORS_ORIGIN` to your exact public site origin in production.
- Set `TURNSTILE_SECRET_KEY` if your form is exposed to bots.
- Restrict who can dispatch the `deploy` workflow in `.github/workflows/deploy.yml`.

## Supported versions

Only the `main` branch is supported. Security fixes will be applied there and called out in the commit message and any release notes.
