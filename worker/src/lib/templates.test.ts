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
  it("links to SITE_URL host in the HTML footer when SITE_URL is set", () => {
    const env = baseEnv({ SITE_URL: "https://example.com" });
    const { html, text } = confirmEmail(env, "https://newsletter.example.com/api/confirm?token=x");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="https://newsletter.example.com"');
    expect(text).toContain("https://example.com");
  });

  it("falls back to BASE_URL in the footer when SITE_URL is unset", () => {
    const env = baseEnv();
    const { html } = confirmEmail(env, "https://newsletter.example.com/api/confirm?token=x");
    expect(html).toContain('href="https://newsletter.example.com"');
  });

  it("omits the postal address line when COMPANY_ADDRESS is unset", () => {
    const { html, text } = confirmEmail(baseEnv(), "https://x/confirm?token=t");
    expect(html).not.toContain("[Add postal address");
    expect(html).not.toContain("COMPANY_ADDRESS");
    expect(text).not.toContain("[Add postal address");
  });

  it("omits the postal address line when COMPANY_ADDRESS is empty string", () => {
    const env = baseEnv({ COMPANY_ADDRESS: "" });
    const { html } = confirmEmail(env, "https://x/confirm?token=t");
    expect(html).not.toMatch(/<br\/>\s*<a/); // no stray <br/> immediately before the link
  });

  it("includes the postal address line when COMPANY_ADDRESS is set", () => {
    const env = baseEnv({ COMPANY_ADDRESS: "ACME, 1 Main St, Townsville" });
    const { html, text } = confirmEmail(env, "https://x/confirm?token=t");
    expect(html).toContain("ACME, 1 Main St, Townsville");
    expect(text).toContain("ACME, 1 Main St, Townsville");
  });

  it("escapes HTML in COMPANY_ADDRESS", () => {
    const env = baseEnv({ COMPANY_ADDRESS: "<script>x</script> & Co." });
    const { html } = confirmEmail(env, "https://x/confirm?token=t");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; Co.");
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
      baseEnv({ COMPANY_ADDRESS: "ACME, 1 Main St" }),
      "https://x/unsub?t=1",
    );
    expect(block).toContain("ACME, 1 Main St");
  });
});
