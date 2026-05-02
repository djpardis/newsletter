import { describe, expect, it } from "vitest";
import {
  baseUrl,
  confirmEmail,
  footerBlock,
  footerText,
  siteUrl,
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
  it("links the brand name to SITE_URL when SITE_URL is set", () => {
    const env = baseEnv({ SITE_URL: "https://example.com", SITE_NAME: "Vance Refrigeration" });
    const { html, text } = confirmEmail(env, "https://newsletter.example.com/api/confirm?token=x");
    expect(html).toContain('href="https://example.com">Vance Refrigeration</a>');
    expect(text).toContain("Vance Refrigeration (https://example.com)");
  });

  it("falls back to BASE_URL when SITE_URL is unset", () => {
    const env = baseEnv();
    const { html } = confirmEmail(env, "https://newsletter.example.com/api/confirm?token=x");
    expect(html).toContain('href="https://newsletter.example.com">');
  });

  it("renders only the word 'Confirm' as the link to confirmUrl", () => {
    const { html, text } = confirmEmail(
      baseEnv({ SITE_NAME: "Vance Refrigeration" }),
      "https://newsletter.example.com/api/confirm?token=t",
    );
    expect(html).toContain('<a href="https://newsletter.example.com/api/confirm?token=t">Confirm</a> your email.');
    expect(text).toContain("Confirm your email: https://newsletter.example.com/api/confirm?token=t");
  });

  it("does not include a postal address", () => {
    const env = baseEnv({ COMPANY_ADDRESS: "Vance Refrigeration, 1725 Slough Avenue, Suite 210, Scranton, PA" });
    const { html, text } = confirmEmail(env, "https://x/confirm?token=t");
    expect(html).not.toContain("Vance Refrigeration, 1725 Slough Avenue");
    expect(text).not.toContain("Vance Refrigeration, 1725 Slough Avenue");
  });

  it("escapes HTML in SITE_NAME", () => {
    const env = baseEnv({ SITE_NAME: "<script>x</script> & Co." });
    const { html } = confirmEmail(env, "https://x/confirm?token=t");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Co.");
  });

  it("includes a footer with signup origin", () => {
    const { html, text } = confirmEmail(baseEnv(), "https://x/confirm?token=t");
    expect(html).toContain("You received this because you signed up at");
    expect(html).not.toContain("<p>----</p>");
    expect(html).not.toContain("<hr");
    expect(text).toContain("---");
  });
});

describe("footerBlock / footerText", () => {
  it("uses SITE_URL hostname in the 'you signed up at' line", () => {
    const env = baseEnv({ SITE_URL: "https://example.com" });
    const block = footerBlock(env, "https://x/unsub?t=1");
    const text = footerText(env, "https://x/unsub?t=1");
    expect(block).toContain("you signed up at example.com");
    expect(text).toContain("you signed up at example.com");
  });

  it("falls back to BASE_URL hostname when SITE_URL is unset", () => {
    const env = baseEnv();
    const block = footerBlock(env, "https://x/unsub?t=1");
    expect(block).toContain("you signed up at newsletter.example.com");
  });

  it("omits postal line and trailing <br/> when address is empty", () => {
    const block = footerBlock(baseEnv({ COMPANY_ADDRESS: "" }), "https://x/unsub?t=1");
    expect(block).not.toContain("[Add postal address");
    expect(block).not.toMatch(/<br\/>\s*<\/p>/); // no dangling <br/> before </p>
  });

  it("includes postal line when address is set", () => {
    const block = footerBlock(
      baseEnv({ COMPANY_ADDRESS: "Vance Refrigeration, 1725 Slough Avenue, Suite 210, Scranton, PA" }),
      "https://x/unsub?t=1",
    );
    expect(block).toContain("Vance Refrigeration, 1725 Slough Avenue, Suite 210, Scranton, PA");
  });
});
