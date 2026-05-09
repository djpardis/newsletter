import { describe, expect, it } from "vitest";
import {
  baseUrl,
  campaignEmail,
  confirmOkPage,
  confirmEmail,
  siteUrl,
  unsubscribedPage,
} from "./templates.js";
import type { Env } from "../types.js";

const baseEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    BASE_URL: "https://newsletter.example.com",
    ...overrides,
  }) as Env;

describe("siteUrl / baseUrl", () => {
  it("siteUrl falls back to BASE_URL when SITE_URL is unset", () => {
    expect(siteUrl(baseEnv())).toBe("https://newsletter.example.com");
  });

  it("siteUrl prefers SITE_URL when set", () => {
    expect(siteUrl(baseEnv({ SITE_URL: "https://example.com" }))).toBe(
      "https://example.com",
    );
  });

  it("siteUrl strips a trailing slash", () => {
    expect(siteUrl(baseEnv({ SITE_URL: "https://example.com/" }))).toBe(
      "https://example.com",
    );
  });

  it("baseUrl always returns the Worker host (no SITE_URL fallback)", () => {
    expect(
      baseUrl(baseEnv({ SITE_URL: "https://example.com" })),
    ).toBe("https://newsletter.example.com");
  });
});

describe("confirmEmail", () => {
  const env = baseEnv({
    SITE_URL: "https://futureshock.media",
    SITE_NAME: "Future Shock Media",
  });
  const confirmUrl = "https://newsletter.futureshock.media/api/confirm?token=TOK";

  // CANONICAL confirmation email. Do NOT change unless explicitly requested.
  // Adding a signature, footer, "More soon.", postal address, font styling,
  // or any other line will break this test on purpose.
  it("matches the canonical confirmation email", () => {
    const { html, text } = confirmEmail(env, confirmUrl);
    expect(html).toBe(
      [
        "<!DOCTYPE html><html><body>",
        "  <p>Thank you for subscribing to Future Shock Media.</p>",
        `  <p><a href="${confirmUrl}">Confirm</a> your email.</p>`,
        "  <p>If you did not subscribe, ignore this message.</p>",
        "  </body></html>",
      ].join("\n"),
    );
    expect(text).toBe(
      [
        "Thank you for subscribing to Future Shock Media.",
        "",
        `Confirm your email: ${confirmUrl}`,
        "",
        "If you did not subscribe, ignore this message.",
      ].join("\n"),
    );
  });

  it("subject is 'Confirm your subscription to <brand>'", () => {
    const { subject } = confirmEmail(env, confirmUrl);
    expect(subject).toBe("Confirm your subscription to Future Shock Media");
  });

  it("escapes HTML in SITE_NAME", () => {
    const e = baseEnv({ SITE_NAME: "<script>x</script> & Co." });
    const { html } = confirmEmail(e, confirmUrl);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Co.");
  });
});

describe("confirmation pages", () => {
  const env = baseEnv({
    SITE_URL: "https://futureshock.media",
    SITE_NAME: "Future Shock Media",
  });

  it("does not show a top brand label on the subscribe confirmation page", () => {
    const html = confirmOkPage(env);
    expect(html).toContain("<title>Confirmed</title>");
    expect(html).toContain("<h1>Confirmed</h1>");
    expect(html).not.toContain("Confirmed!");
    expect(html).toContain('Thank you for subscribing to <a href="https://futureshock.media">Future Shock Media</a>.');
    expect(html).not.toContain('font-size:.85rem;color:#888;margin-bottom:1.5rem');
  });

  it("does not show a top brand label on the unsubscribe confirmation page", () => {
    const html = unsubscribedPage(env);
    expect(html).toContain("<title>Unsubscribed</title>");
    expect(html).toContain("<h1>Unsubscribed</h1>");
    expect(html).not.toContain("Unsubscribed!");
    expect(html).not.toContain("You're unsubscribed!");
    expect(html).toContain('You won\'t receive any further emails from <a href="https://futureshock.media">Future Shock Media</a>.');
    expect(html).not.toContain('font-size:.85rem;color:#888;margin-bottom:1.5rem');
  });

  it("uses responsive viewport and wrapping styles", () => {
    const html = confirmOkPage(env);
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(html).toContain("width:min(100%,36rem)");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain("clamp(");
  });
});

describe("campaignEmail", () => {
  it("replaces unsubscribe placeholders without adding font or layout styles", () => {
    const tpl = campaignEmail(
      baseEnv(),
      [
        "<!DOCTYPE html>",
        "<html>",
        "<body>",
        "<p>Hey,</p>",
        '<p>No longer interested? <a href="{{unsubscribe_url}}">Unsubscribe →</a></p>',
        "</body>",
        "</html>",
      ].join("\n"),
      [
        "Hey,",
        "",
        "No longer interested? Unsubscribe → ({{unsubscribe_url}})",
      ].join("\n"),
      "https://newsletter.example.com/api/unsubscribe?token=U",
    );

    expect(tpl.html).toContain(
      '<a href="https://newsletter.example.com/api/unsubscribe?token=U">Unsubscribe →</a>',
    );
    expect(tpl.html).not.toContain("font-family");
    expect(tpl.html).not.toContain("style=");
    expect(tpl.text).toContain(
      "No longer interested? Unsubscribe → (https://newsletter.example.com/api/unsubscribe?token=U)",
    );
  });
});
