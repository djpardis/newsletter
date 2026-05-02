# Examples

Reference snippets for wiring a website to the Worker's `POST /api/subscribe` endpoint. They are intentionally framework-free; adapt to React/Vue/Svelte/etc. as needed.

| File | What it shows |
|------|---------------|
| `signup-form.html` | Drop-in HTML/CSS/JS form. Sends JSON to the API, handles all documented error states, includes a honeypot, and (optionally) a Cloudflare Turnstile widget. |
| `signup-form.js` | Just the fetch logic, ready to paste into an existing component or template. |

## Configuration

Both examples expect the Worker to be reachable at a public URL. Set it via:

- `signup-form.html` — edit the `API_URL` constant at the top of the inline `<script>`, **or** set a `data-api-url` attribute on the `<form>`.
- `signup-form.js` — pass the URL as the second argument to `subscribe(...)`.

If you set `CORS_ORIGIN` on the Worker, it must match the `Origin` of the page hosting the form. Otherwise the browser will block the request.

## Honeypot

A hidden input named `website` is included in the HTML example and silently discarded server-side when filled. The full list of recognized honeypot keys (`website`, `url`, `company`, `hp`, `address`) lives in `worker/src/lib/validation.ts` — pick whichever name your real form is least likely to legitimately use.

## Turnstile

If you set `TURNSTILE_SECRET_KEY` on the Worker, every subscribe request must include a valid `turnstile_token`. The HTML example loads the Turnstile script and includes a widget; supply your **site key** (public) where indicated. The **secret key** stays in the Worker via `wrangler secret put TURNSTILE_SECRET_KEY`.

## Response handling

| Status | Body | What it means |
|--------|------|---------------|
| 200 | `{ ok: true, state: "pending" }` | Confirmation email sent. |
| 200 | `{ ok: true, state: "active" }` | Already an active subscriber; no email sent. |
| 200 | `{ ok: true }` | Honeypot was triggered. Treat as success on the client. |
| 400 | `{ error: "invalid_email" }` | Show inline validation error. |
| 400 | `{ error: "turnstile_failed" }` | Reset the widget and ask the user to try again. |
| 429 | `{ error: "rate_limited", retry_after_sec }` | Tell the user to retry shortly; honor the value. |
| 502 | `{ error: "email_send_failed" }` | Worker accepted the signup but Resend rejected the send. The subscriber row exists; surface a soft error and offer retry. |
