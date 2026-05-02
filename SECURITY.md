# Security policy

## Reporting a vulnerability

**Please do not open a public issue.** Use one of the following private channels:

- Preferred: [GitHub Security Advisories](https://github.com/djpardis/newsletter/security/advisories/new).
- Alternative: open a minimal public issue titled "security contact request" (no details) and we will follow up privately.

Include a description and impact, steps to reproduce or a proof-of-concept (placeholder data only — no real subscriber emails or tokens), and the affected commit SHA.

We aim to acknowledge reports within 3 business days and to ship a fix or mitigation within 30 days for high/critical issues. Reporters are credited in release notes unless they prefer otherwise.

## Scope

In scope: code in this repository, documented HTTP API behavior (`/api/*`), and email header construction (`List-Unsubscribe`, `List-Unsubscribe-Post`).

Out of scope: third-party vendor vulnerabilities (Cloudflare, Resend — report to the vendor), issues that require a valid `ADMIN_BEARER_TOKEN` or Cloudflare account access, and denial of service that requires sustained traffic above the per-IP subscribe rate limit.

## Supported versions

Only the `main` branch is supported.
