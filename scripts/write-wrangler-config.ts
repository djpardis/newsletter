import { writeFileSync } from "node:fs";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function tomlBool(name: string): boolean | undefined {
  const value = optional(name);
  if (!value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

const output = optional("WRANGLER_CONFIG") ?? "wrangler.generated.toml";
const cron = optional("CRON_SCHEDULE") ?? "17 3 * * *";
const customDomain = optional("WORKER_CUSTOM_DOMAIN");
const workersDev = tomlBool("WORKERS_DEV");
const previewUrls = tomlBool("PREVIEW_URLS");
const rateLimitNamespaceId = optional("RATE_LIMIT_NAMESPACE_ID");

const vars: Record<string, string | undefined> = {
  FROM_EMAIL: required("FROM_EMAIL"),
  BASE_URL: required("BASE_URL"),
  SITE_URL: optional("SITE_URL"),
  SITE_NAME: optional("SITE_NAME"),
  SITE_TAGLINE: optional("SITE_TAGLINE"),
  CORS_ORIGIN: optional("CORS_ORIGIN"),
  COMPANY_ADDRESS: optional("COMPANY_ADDRESS"),
  UNSUBSCRIBE_MAILTO: optional("UNSUBSCRIBE_MAILTO"),
  NOTIFY_EMAIL: optional("NOTIFY_EMAIL"),
  DIGEST_EMAIL: optional("DIGEST_EMAIL"),
};

const lines = [
  `name = ${tomlString(required("WORKER_NAME"))}`,
  `main = "worker/src/index.ts"`,
  `compatibility_date = "2025-05-01"`,
];

if (workersDev !== undefined) lines.push(`workers_dev = ${workersDev}`);
if (previewUrls !== undefined) lines.push(`preview_urls = ${previewUrls}`);
if (customDomain) {
  lines.push(
    `routes = [`,
    `  { pattern = ${tomlString(customDomain)}, custom_domain = true }`,
    `]`,
  );
}

lines.push(
  ``,
  `[triggers]`,
  `crons = [${tomlString(cron)}]`,
);

if (rateLimitNamespaceId) {
  lines.push(
    ``,
    `[[ratelimits]]`,
    `name = "SUBSCRIBE_RATE_LIMITER"`,
    `namespace_id = ${tomlString(rateLimitNamespaceId)}`,
    ``,
    `[ratelimits.simple]`,
    `limit = ${optional("RATE_LIMIT_LIMIT") ?? "8"}`,
    `period = ${optional("RATE_LIMIT_PERIOD") ?? "60"}`,
  );
}

lines.push(
  ``,
  `[[queues.producers]]`,
  `binding = "SEND_QUEUE"`,
  `queue = ${tomlString(required("SEND_QUEUE_NAME"))}`,
  ``,
  `[[queues.consumers]]`,
  `queue = ${tomlString(required("SEND_QUEUE_NAME"))}`,
  `max_batch_size = ${optional("QUEUE_MAX_BATCH_SIZE") ?? "10"}`,
  `max_retries = ${optional("QUEUE_MAX_RETRIES") ?? "3"}`,
  ``,
  `[vars]`,
);

for (const [key, value] of Object.entries(vars)) {
  if (value !== undefined) lines.push(`${key} = ${tomlString(value)}`);
}

lines.push(
  ``,
  `[[d1_databases]]`,
  `binding = "DB"`,
  `database_name = ${tomlString(required("D1_DATABASE_NAME"))}`,
  `database_id = ${tomlString(required("D1_DATABASE_ID"))}`,
  `migrations_dir = "migrations"`,
  ``,
);

writeFileSync(output, `${lines.join("\n")}\n`);
console.log(`Wrote ${output}`);
