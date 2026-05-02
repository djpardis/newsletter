/**
 * Run `wrangler d1 execute` against a remote DB.
 * Set NEWSLETTER_D1_NAME (matches wrangler.toml database_name, default `newsletter`).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function d1Name(): string {
  return process.env.NEWSLETTER_D1_NAME ?? "newsletter";
}

export function runD1Sql(sql: string): void {
  const file = join(tmpdir(), `newsletter-d1-${Date.now()}.sql`);
  writeFileSync(file, sql, "utf8");
  try {
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", d1Name(), "--remote", "--file", file],
      { stdio: "inherit", cwd: process.cwd() },
    );
  } finally {
    unlinkSync(file);
  }
}
