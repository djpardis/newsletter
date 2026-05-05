import { describe, expect, it } from "vitest";
import {
  baseUrl,
  confirmOkPage,
  confirmEmail,
  footerBlock,
  footerText,
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

describe("footerBlock / footerText", () => {
  // CANONICAL plain-text footer. Do NOT change unless explicitly requested.
  it("matches the canonical plain-text snapshot", () => {
    const env = baseEnv({
      SITE_URL: "https://futureshock.media",
      SITE_NAME: "Future Shock Media",
      SITE_TAGLINE: "Boring on purpose.",
    });
    const text = footerText(env, "https://newsletter.futureshock.media/api/unsubscribe?token=U");
    expect(text).toBe(
      [
        "",
        "",
        "— Future Shock Media",
        "Boring on purpose.",
        "",
        "---",
        "You're receiving this because you subscribed at Future Shock Media. To stop, unsubscribe here:",
        "https://newsletter.futureshock.media/api/unsubscribe?token=U",
      ].join("\n"),
    );
  });

  it("links the brand and unsubscribe in the HTML footer", () => {
    const env = baseEnv({
      SITE_URL: "https://futureshock.media",
      SITE_NAME: "Future Shock Media",
    });
    const block = footerBlock(env, "https://x/unsub?t=1");
    expect(block).toContain('<a href="https://futureshock.media">Future Shock Media</a>');
    expect(block).toContain('<a href="https://x/unsub?t=1">unsubscribe here</a>');
  });

  it("omits postal line and trailing <br/> when address is empty", () => {
    const block = footerBlock(baseEnv({ COMPANY_ADDRESS: "" }), "https://x/unsub?t=1");
    expect(block).not.toContain("[Add postal address");
    expect(block).not.toMatch(/<br\/>\s*<\/p>/);
  });

  it("includes postal line when address is set", () => {
    const block = footerBlock(
      baseEnv({ COMPANY_ADDRESS: "Vance Refrigeration, 1725 Slough Avenue, Suite 210, Scranton, PA" }),
      "https://x/unsub?t=1",
    );
    expect(block).toContain("Vance Refrigeration, 1725 Slough Avenue, Suite 210, Scranton, PA");
  });
});

describe("confirmation pages", () => {
  const env = baseEnv({
    SITE_URL: "https://futureshock.media",
    SITE_NAME: "Future Shock Media",
  });

  it("does not show a top brand label on the subscribe confirmation page", () => {
    const html = confirmOkPage(env);
    expect(html).toContain('Thank you for subscribing to <a href="https://futureshock.media">Future Shock Media</a>.');
    expect(html).not.toContain('font-size:.85rem;color:#888;margin-bottom:1.5rem');
  });

  it("does not show a top brand label on the unsubscribe confirmation page", () => {
    const html = unsubscribedPage(env);
    expect(html).toContain('You won\'t receive any further emails from <a href="https://futureshock.media">Future Shock Media</a>.');
    expect(html).not.toContain('font-size:.85rem;color:#888;margin-bottom:1.5rem');
  });
});
