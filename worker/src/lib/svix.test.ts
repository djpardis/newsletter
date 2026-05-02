import { describe, expect, it } from "vitest";
import { verifySvixSignature } from "./svix.js";

const SECRET_RAW = "MWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=";

async function sign(secret: string, id: string, ts: string, body: string) {
  const decoded = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    decoded,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${ts}.${body}`),
  );
  let s = "";
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

describe("verifySvixSignature", () => {
  const id = "msg_1";
  const body = '{"hello":"world"}';

  it("accepts a valid signature", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await sign(SECRET_RAW, id, ts, body);
    const r = await verifySvixSignature({
      secret: `whsec_${SECRET_RAW}`,
      id,
      timestamp: ts,
      signatureHeader: `v1,${sig}`,
      rawBody: body,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const r = await verifySvixSignature({
      secret: `whsec_${SECRET_RAW}`,
      id,
      timestamp: ts,
      signatureHeader: "v1,AAAA",
      rawBody: body,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const ts = String(Math.floor((Date.now() - 10 * 60 * 1000) / 1000));
    const sig = await sign(SECRET_RAW, id, ts, body);
    const r = await verifySvixSignature({
      secret: `whsec_${SECRET_RAW}`,
      id,
      timestamp: ts,
      signatureHeader: `v1,${sig}`,
      rawBody: body,
    });
    expect(r.ok).toBe(false);
  });
});
