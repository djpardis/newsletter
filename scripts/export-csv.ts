/**
 * Export subscribers to stdout as CSV.
 *
 * Usage: NEWSLETTER_D1_NAME=newsletter npx tsx scripts/export-csv.ts > out.csv
 */
import { execFileSync } from "node:child_process";
import { d1Name } from "./lib/wrangler-d1.js";

function main() {
  const sql =
    "SELECT email, status, created_at, confirmed_at, unsubscribed_at FROM subscribers ORDER BY created_at";
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      d1Name(),
      "--remote",
      "--command",
      sql,
      "--json",
    ],
    { encoding: "utf8", cwd: process.cwd() },
  );
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(out) as Array<{ results?: Record<string, unknown>[] }>;
    rows = parsed[0]?.results ?? [];
  } catch {
    console.error("Unexpected wrangler output:", out.slice(0, 500));
    process.exit(1);
  }
  console.log("email,status,created_at,confirmed_at,unsubscribed_at");
  for (const r of rows) {
    const line = [
      r.email,
      r.status,
      r.created_at,
      r.confirmed_at ?? "",
      r.unsubscribed_at ?? "",
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",");
    console.log(line);
  }
}

main();
