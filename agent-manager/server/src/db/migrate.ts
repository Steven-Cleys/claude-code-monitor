import { sql } from "./connection";
import { readFileSync } from "fs";
import { join } from "path";
import { Glob } from "bun";

export async function runMigrations() {
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const migrationsDir = join(import.meta.dir, "migrations");
  const glob = new Glob("*.sql");
  const files = Array.from(glob.scanSync(migrationsDir)).sort();

  for (const file of files) {
    const [applied] = await sql`
      SELECT id FROM migrations WHERE name = ${file}
    `;
    if (applied) continue;

    const content = readFileSync(join(migrationsDir, file), "utf-8");
    await sql.unsafe(content);
    await sql`INSERT INTO migrations (name) VALUES (${file})`;
    console.log(`Migration applied: ${file}`);
  }
}
