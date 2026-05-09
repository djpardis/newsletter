import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const CHECKS = [
  {
    name: "Resend API key",
    re: /\bre_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    name: "Svix webhook secret",
    re: /\bwhsec_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    name: "long bearer/token-looking hex string",
    re: /\b[a-f0-9]{48,}\b/gi,
  },
  {
    name: "UUID",
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  },
  {
    name: "private/local filesystem path",
    re: /\/Users\/[A-Za-z0-9._-]+\/[^\s)`'"]+/g,
  },
];
const SCANNED_EXTENSIONS = [
  ".example",
  ".js",
  ".json",
  ".md",
  ".mdc",
  ".ts",
  ".toml",
  ".yaml",
  ".yml",
];

function trackedAndUntrackedFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

function shouldScan(path: string): boolean {
  if (path.startsWith("node_modules/")) return false;
  if (path.startsWith(".wrangler/")) return false;
  if (path === "wrangler.toml") return false;
  return SCANNED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function isAllowedEmail(value: string): boolean {
  const email = value;
  const lower = email.toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  if (["example.com", "example.net", "example.org", "yourdomain.com"].includes(domain)) {
    return true;
  }
  // Gmail-specific canonicalization tests need Gmail-shaped placeholders.
  return lower === "sample.user+test@gmail.com" || lower === "sampleuser@gmail.com";
}

function isAllowedValue(kind: string, value: string): boolean {
  if (kind === "email") return isAllowedEmail(value);
  if (kind === "UUID") return value === "00000000-0000-4000-8000-000000000000";
  return false;
}

const violations: Array<{ path: string; kind: string; value: string }> = [];

for (const path of trackedAndUntrackedFiles().filter(shouldScan)) {
  const text = readFileSync(path, "utf8");
  const emails = text.match(EMAIL_RE) ?? [];
  for (const email of emails) {
    if (!isAllowedValue("email", email)) {
      violations.push({ path, kind: "email", value: email });
    }
  }
  for (const check of CHECKS) {
    const matches = text.match(check.re) ?? [];
    for (const value of matches) {
      if (!isAllowedValue(check.name, value)) {
        violations.push({ path, kind: check.name, value });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Found non-placeholder private identifiers in public files:");
  for (const { path, kind, value } of violations) {
    console.error(`- ${path}: ${kind}: ${value}`);
  }
  console.error("\nUse reserved placeholders only; do not commit real emails, secrets, IDs, or local paths.");
  process.exit(1);
}

console.log("Public identifier check passed.");

export {};
