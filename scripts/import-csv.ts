/**
 * Import subscribers from CSV: email[,status]
 * Statuses: active, pending, unsubscribed, bounced, complained (default: active)
 *
 * Usage: NEWSLETTER_D1_NAME=newsletter npx tsx scripts/import-csv.ts ./list.csv
 */
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { runD1Sql } from "./lib/wrangler-d1.js";

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

const allowed = new Set([
  "active",
  "pending",
  "unsubscribed",
  "bounced",
  "complained",
]);

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/import-csv.ts <file.csv>");
    process.exit(1);
  }
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const now = Date.now();
  const stmts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    if (i === 0 && /email/i.test(row[0] ?? "")) continue;
    const email = (row[0] ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    let status = (row[1] ?? "active").trim().toLowerCase();
    if (!allowed.has(status)) status = "active";

    const id = randomUUID();

    let confirmed: string | null = null;
    let unsubscribedAt: string | null = null;
    let unsubTok: string | null = null;

    if (status === "active") {
      confirmed = String(now);
      unsubTok = randomBytes(18).toString("hex");
    } else if (
      status === "unsubscribed" ||
      status === "bounced" ||
      status === "complained"
    ) {
      unsubscribedAt = String(now);
    }

    const unsubTokSql = unsubTok ? `'${esc(unsubTok)}'` : "NULL";
    const confirmedSql = confirmed ?? "NULL";
    const unsubAtSql = unsubscribedAt ?? "NULL";

    stmts.push(`INSERT OR IGNORE INTO subscribers (
      id, email, status, created_at, confirmed_at, unsubscribed_at,
      source, ip_hash, user_agent_hash, metadata_json, unsubscribe_token
    ) VALUES (
      '${esc(id)}', '${esc(email)}', '${status}', ${now},
      ${confirmedSql}, ${unsubAtSql},
      'csv_import', NULL, NULL, NULL, ${unsubTokSql}
    );`);
  }

  runD1Sql(stmts.join("\n"));
  console.error(`Imported ${stmts.length} rows (duplicates ignored).`);
}

main();
