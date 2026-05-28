import { describe, expect, it } from "vitest";
import { corsHeaders } from "./cors.js";
import type { Env } from "../types.js";

function allowOrigin(headers: HeadersInit): string | null {
  return new Headers(headers).get("Access-Control-Allow-Origin");
}

function request(origin?: string): Request {
  return new Request("https://newsletter.example.com/api/subscribe", {
    headers: origin ? { Origin: origin } : {},
  });
}

describe("corsHeaders", () => {
  it("allows configured production origins", () => {
    const headers = corsHeaders(
      { CORS_ORIGIN: "https://example.com,http://localhost:*" } as Env,
      request("https://example.com"),
    );

    expect(allowOrigin(headers)).toBe("https://example.com");
  });

  it("allows localhost wildcard ports", () => {
    const headers = corsHeaders(
      { CORS_ORIGIN: "https://example.com,http://localhost:*" } as Env,
      request("http://localhost:8080"),
    );

    expect(allowOrigin(headers)).toBe("http://localhost:8080");
  });

  it("falls back to the first configured origin when the request origin is not allowed", () => {
    const headers = corsHeaders(
      { CORS_ORIGIN: "https://example.com,http://localhost:*" } as Env,
      request("https://other.example"),
    );

    expect(allowOrigin(headers)).toBe("https://example.com");
  });
});
