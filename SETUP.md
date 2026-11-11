# Setup

## Requirements

- **Node** 22 or newer
- **Cloudflare** account: install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and run `npx wrangler login`
- **Resend** account: [verify a sending domain](https://resend.com/docs/dashboard/domains/introduction) and create an API key

## Install

Local development needs no Cloudflare or Resend resources:

```bash
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply newsletter --local
npm run dev
```

The Worker runs at `http://localhost:8787`. With `RESEND_API_KEY` blank and a
localhost `BASE_URL`, the Worker prints each email, including the confirmation
link, to the dev log instead of sending it. `npm run smoke` runs these steps
against `.dev.vars.example` and fails on any Worker error.

Production setup, including the D1 database, optional queue, secrets, and
webhooks: [DEPLOYING.md](DEPLOYING.md).

## Configuration

Bind each `env.<NAME>` from Cloudflare **Secrets** (`npx wrangler secret put <NAME>`) or **Variables** (`wrangler.toml` `[vars]` / dashboard). Runtime behavior is the same; Secrets remain out of tracked config.

| Name | Required | Set with | Purpose |
|------|----------|----------|---------|
| `RESEND_API_KEY` | yes | `secret put` | Resend API key |
| `ADMIN_BEARER_TOKEN` | yes | `secret put` | Bearer token for admin endpoints |
| `FROM_EMAIL` | yes | `[vars]` | Sender address (`Name <email@domain>`) |
| `REPLY_TO` | optional | `[vars]` | Reply-To on campaign mail (`hello@yourdomain.com`) |
| `BASE_URL` | yes | `[vars]` | Public Worker URL (no trailing slash) |
| `NOTIFY_EMAIL` | optional | `[vars]` | Operator email on new subscriber or reactivation |
| `DIGEST_EMAIL` | optional | `[vars]` | Weekly digest recipient; falls back to `NOTIFY_EMAIL` |
| `RESEND_WEBHOOK_SECRET` | optional | `secret put` | Enables `/api/webhooks/resend` |
| `TURNSTILE_SECRET_KEY` | optional | `secret put` | Requires Cloudflare Turnstile on subscribe |
| `SITE_URL` | optional | `[vars]` | Website URL for redirects and email links; falls back to `BASE_URL` |
| `CORS_ORIGIN` | optional | `[vars]` | Allowed origin for `/api/subscribe`; use comma-separated values for multiple origins, and `http://localhost:*` / `http://127.0.0.1:*` for local dev |
| `SITE_NAME` | optional | `[vars]` | Brand name in emails (default: `Newsletter`) |
| `CONFIRM_EMAIL_SUBJECT` | optional | `[vars]` | Confirmation email subject (default: `Confirm your subscription to <SITE_NAME>`) |
| `CONFIRMED_PAGE_HEADING` | optional | `[vars]` | Title and heading of the page shown after confirming (default: `Confirmed`) |
| `WELCOME_CAMPAIGN_SLUG` | optional | `[vars]` | Slug of a campaign sent to each subscriber after they confirm (unset: no welcome email). See [Welcome email](#welcome-email) |
| `REVIEW_EMAIL` | optional | `[vars]` | Recipient of review emails from `request-approval.ts` (default: `REPLY_TO`). See [Review and send by email](#review-and-send-by-email) |
| `COMPANY_ADDRESS` | optional | `[vars]` | Postal line in campaign footers (CAN-SPAM/CASL) |
| `UNSUBSCRIBE_MAILTO` | optional | `[vars]` | Mailto address for `List-Unsubscribe` header |

See `.env.example` for a checklist.

## HTTP API

Public routes on your Worker (`BASE_URL`). Subscriber flows use token links; admin routes need `Authorization: Bearer <ADMIN_BEARER_TOKEN>`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | none | Liveness check |
| `POST` | `/api/subscribe` | none | Subscribe; see [examples/](examples/) |
| `GET` | `/api/confirm` | none | Double opt-in confirmation |
| `GET`, `POST` | `/api/unsubscribe` | none | One-click unsubscribe ([RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058)) |
| `POST` | `/api/campaigns/send` | Bearer | Enqueue campaign to active subscribers |
| `POST` | `/api/campaigns/test-send` | Bearer | Send one campaign to one test recipient |
| `POST` | `/api/campaigns/request-approval` | Bearer | Create an unsent campaign and email the reviewer a one-time send link |
| `GET`, `POST` | `/api/campaigns/approve` | one-time token | Show the send confirmation page (`GET`) and send the campaign (`POST`) |
| `POST` | `/api/webhooks/resend` | Svix | Handle bounce and complaint events |
| `POST` | `/api/admin/delete` | Bearer | Hard-delete a subscriber (GDPR) |
| `POST` | `/api/admin/weekly-digest/test-send` | Bearer | Send the weekly operator digest immediately |

## Subscriber notifications

When `NOTIFY_EMAIL` is configured, the Worker sends a transactional operator email only when the `subscribers` table changes for a real record:

- new row inserted (`subscribe_created`)
- existing unsubscribed row reactivated (`subscribe_reactivated`)

Honeypot hits, already-active subscribers, and pending confirmation resends do not notify.

## Weekly operator digest

When `DIGEST_EMAIL` is set, the scheduled Worker sends a plain-text digest every Monday UTC. If unset, it uses `NOTIFY_EMAIL`; if neither is set, no digest is sent.

Subject format: `<Site Name> (<Start date> - <End date>)`.

The digest covers the previous 7 days: new and reactivated subscribers, unsubscribes, bounces, complaints, net change, status totals, campaigns with sent/failed counts, top sources, and pending confirmations older than 48 hours.

Gmail and Googlemail addresses are shown in canonical form (dots and `+tag` aliases removed from the local part).

## Scripts

```bash
npx tsx scripts/import-csv.ts <file.csv>   # import email[,status]
npx tsx scripts/export-csv.ts              # export subscribers as CSV
npx tsx scripts/create-campaign.ts --md post.md --slug s --subject "..." --kind manual
npx tsx scripts/send-test.ts --md post.md --to you@example.com   # create + test-send in one step
npx tsx scripts/send-test-campaign.ts      # POST /api/campaigns/test-send (needs --id)
npx tsx scripts/send-campaign.ts           # POST /api/campaigns/send (requires --reviewed)
npx tsx scripts/request-approval.ts --md post.md   # email a review copy with a one-time send link
```

The fastest path is `send-test.ts`: it reads `NEWSLETTER_API_URL`, `ADMIN_BEARER_TOKEN`, and `NEWSLETTER_D1_NAME` from a local `.env` (gitignored), creates the campaign from Markdown with a unique dated slug, and immediately test-sends to any `--to` address. Pass `--id <uuid>` instead of `--md` to reuse an existing campaign. Shell-exported env vars override `.env`.

Before sending, `send-test.ts` and `send-campaign.ts` compare the deployed Worker's `/health` SHA to your local `git HEAD` and refuse to send against a stale deployment (deploy first, or pass `--skip-version-check`). See [DEPLOYING.md](DEPLOYING.md) for keeping the Worker in sync.

## Campaign style

Every campaign includes the `{{unsubscribe_url}}` link, and the scripts check
campaigns against a default house style that you can change. To start a new
list, copy
[examples/campaigns/](examples/campaigns/) into your site repository as
`campaigns/` and replace the sender name, tagline, and newsletter name in
`campaigns/_templates/footer.md`. A campaign opens with "Hey,", ends with
"More soon.", a signature line, an italic tagline, and a footer, and its
subject does not contain an em dash:

```markdown
Hey,

The campaign body.

More soon.

\- Sender name  
*Tagline*

You're receiving this because you subscribed to Sender name.  
No longer interested? [Unsubscribe →]({{unsubscribe_url}})
```

The signature line can start with an em dash or an escaped hyphen (`\-`),
which keeps Markdown from turning it into a list item. To use a different
house style, add `campaigns/_templates/rules.json` next to your campaigns. The
scripts read it from the nearest `_templates` folder above the Markdown file,
and it replaces the default rules entirely. An empty `{}` file turns the house
style off, while the unsubscribe link is always required:

```json
{
  "startsWith": "Hey,",
  "patterns": [
    { "pattern": "\\nMore soon\\.\\n", "message": "End with \"More soon.\"" }
  ],
  "subjectMustNotContain": ["!!"]
}
```

`patterns` are regular expressions matched against the Markdown body. A
`{{campaign_footer}}` marker in a campaign is replaced with
`campaigns/_templates/footer.md` before validation.

For the explicit two-step flow, create a campaign from reviewed Markdown with `create-campaign.ts`, send a one-off test with `send-test-campaign.ts`, then production send with `send-campaign.ts --reviewed`. Test sends do not update campaign delivery metrics; recipients still get real unsubscribe links.

## Welcome email

Set `WELCOME_CAMPAIGN_SLUG` to send a campaign to each subscriber right after
they confirm. The welcome email is an ordinary campaign, so it is written,
created, and tested with the same scripts as any other campaign:

```bash
npx tsx scripts/create-campaign.ts --md campaigns/welcome.md --slug welcome
npx tsx scripts/send-test-campaign.ts --id <campaign id> --to you@example.com
```

After the test email looks right, set `WELCOME_CAMPAIGN_SLUG = "welcome"` in
`[vars]` and deploy. Confirming then queues the campaign for the new
subscriber on the same send queue as regular campaigns, so it gets the same
retries, unsubscribe link, and delivery row. The confirmation page does not
wait for the send. A subscriber who already received the welcome campaign,
for example after unsubscribing and joining again, does not receive it a
second time. If the slug does not match a campaign, confirming still succeeds
and a `welcome_campaign_missing` audit event is recorded.

Campaign slugs are unique, so to change the welcome email, create a new
campaign with a new slug such as `welcome-2` and point `WELCOME_CAMPAIGN_SLUG`
at it. Subscribers who confirm after the change receive the new version.

## Review and send by email

`request-approval.ts` lets the operator review a campaign in their inbox and
send it from there, without running a send command:

```bash
npx tsx scripts/request-approval.ts --md campaigns/issue-12.md
```

The script renders the Markdown with the campaign style rules and posts it to
`POST /api/campaigns/request-approval`. The Worker creates the campaign
without sending it and emails a review copy to `REVIEW_EMAIL`, or to
`REPLY_TO` when `REVIEW_EMAIL` is unset. The review copy is the real campaign
with a notice at the top and a "Review and send" link. Opening the link shows
the subject and the number of active subscribers, and nothing is sent until
the reviewer presses the send button on that page. The send then uses the same
queue, delivery rows, and duplicate protection as `send-campaign.ts`.

Each link works once and expires after 7 days. Only a SHA-256 of the token is
stored. A slug that already has a campaign is skipped, so a site can call the
script for every post on each deploy and only new posts produce review emails.
Pass `--refresh` to replace the content of an unsent campaign and send a new
link, which also invalidates the old one. Pass `--to <address>` to send the
review copy somewhere other than the default reviewer.
