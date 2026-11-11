import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/**
 * In-memory D1 stand-in backed by node:sqlite with every migration applied,
 * so route tests exercise the real schema instead of matching SQL strings.
 */
export function sqliteD1(): { d1: D1Database; db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  }

  const prepare = (sql: string) => {
    let args: SQLInputValue[] = [];
    const statement = {
      bind(...values: unknown[]) {
        args = values.map((v) => (v === undefined ? null : v)) as SQLInputValue[];
        return statement;
      },
      async first<T>() {
        return (db.prepare(sql).get(...args) ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...args) as T[], success: true, meta: {} };
      },
      async run() {
        const result = db.prepare(sql).run(...args);
        return { results: [], success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  };

  return { d1: { prepare } as unknown as D1Database, db };
}
