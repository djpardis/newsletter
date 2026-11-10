/**
 * Check a deployed Worker without querying its hostname through the local DNS
 * resolver. Resolvers cache a "does not exist" answer for up to 30 minutes, so
 * a lookup made before the custom domain exists breaks the signup form on that
 * network after the deploy succeeds. This script asks the zone's authoritative
 * nameservers, which do not cache answers, and connects to the address they
 * return, so it is safe to run before or right after a deploy.
 *
 * Usage:
 *   npm run verify
 *   npm run verify -- --email you@example.com
 *   WRANGLER_CONFIG=wrangler.<operator>.toml npm run verify
 *
 * Options:
 *   --url <BASE_URL>     Worker URL (default: BASE_URL in the Wrangler config)
 *   --origin <url>       Site origin to check CORS for (default: SITE_URL)
 *   --email <address>    Subscribe this address and send a real confirmation email
 */
import { Resolver } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { request } from "node:https";
import type { LookupFunction } from "node:net";

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(`✘ ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`✔ ${message}`);
}

function configVar(name: string): string | undefined {
  const file = process.env.WRANGLER_CONFIG || "wrangler.toml";
  try {
    return readFileSync(file, "utf8").match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
  } catch {
    return undefined;
  }
}

async function authoritativeAddress(host: string): Promise<string | undefined> {
  const labels = host.split(".");
  for (let i = 1; i < labels.length - 1; i++) {
    const zone = labels.slice(i).join(".");
    const nameservers = await new Resolver().resolveNs(zone).catch(() => []);
    if (nameservers.length === 0) continue;
    const resolver = new Resolver();
    const addresses = (await Promise.all(nameservers.map((ns) => resolver.resolve4(ns).catch(() => [])))).flat();
    const authoritative = new Resolver();
    authoritative.setServers(addresses);
    return (await authoritative.resolve4(host).catch(() => []))[0];
  }
  return undefined;
}

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function send(
  url: URL,
  address: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<Reply> {
  const lookup: LookupFunction = (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers, lookup, timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

function json(reply: Reply): Record<string, unknown> {
  try {
    return JSON.parse(reply.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const baseUrl = (option("url") ?? configVar("BASE_URL"))?.replace(/\/$/, "");
if (!baseUrl) fail("No BASE_URL. Pass --url or set BASE_URL in the Wrangler config.");
const origin = option("origin") ?? configVar("SITE_URL");
const email = option("email");
const base = new URL(baseUrl);
if (base.protocol !== "https:") fail(`${baseUrl} must use https`);

const address = await authoritativeAddress(base.hostname);
if (!address) {
  fail(
    `${base.hostname} has no public DNS record yet. Deploy first and wait for the custom domain. ` +
      "Do not open the URL in a browser or query it with curl until this check passes.",
  );
}
ok(`${base.hostname} resolves to ${address} on its authoritative nameservers`);

const health = json(await send(new URL("/health", base), address, "GET", {}));
if (health.ok !== true) fail(`GET ${baseUrl}/health did not return { "ok": true }`);
ok(`Health check passed (sha ${String(health.sha ?? "not set")})`);

const subscribeUrl = new URL("/api/subscribe", base);
if (origin) {
  const preflight = await send(subscribeUrl, address, "OPTIONS", {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
  });
  if (preflight.headers["access-control-allow-origin"] !== origin) {
    fail(`CORS_ORIGIN does not allow ${origin}`);
  }
  ok(`CORS allows ${origin}`);
} else {
  console.log("! No SITE_URL or --origin, so CORS was not checked");
}

const subscribe = (payload: Record<string, string>) =>
  send(
    subscribeUrl,
    address,
    "POST",
    { "content-type": "application/json", ...(origin ? { Origin: origin } : {}) },
    JSON.stringify(payload),
  );

const invalid = json(await subscribe({ email: "not-an-email", website: "" }));
if (invalid.error !== "invalid_email") fail(`Expected invalid_email, got ${JSON.stringify(invalid)}`);
ok("Server validation rejects an invalid email");

if (!email) {
  console.log("! Pass --email <address> to send a real confirmation email");
  process.exit(0);
}

const signup = json(await subscribe({ email, website: "", source: "verify-deployment" }));
if (signup.ok !== true) fail(`Signup was rejected: ${JSON.stringify(signup)}`);
ok(
  signup.state === "active"
    ? `${email} is already subscribed, so no email was sent`
    : "Signup accepted, and Resend accepted the confirmation email",
);
console.log(`! Confirm the email arrived at ${email}, including spam and filtered tabs`);
