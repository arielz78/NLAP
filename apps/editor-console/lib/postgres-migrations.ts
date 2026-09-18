import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "@neondatabase/serverless";

const migrationNamePattern = /^\d{4}_[a-z0-9_]+\.sql$/;

export async function applyMigrations(
  connectionString: string,
  migrationDirectory = resolve(process.cwd(), "db/migrations"),
) {
  const names = (await readdir(migrationDirectory))
    .filter((name) => migrationNamePattern.test(name))
    .sort();
  const pool = new Pool({ connectionString });
  const appliedNames: string[] = [];

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS editor_console_schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const name of names) {
      const applied = await pool.query(
        "SELECT name FROM editor_console_schema_migrations WHERE name = $1",
        [name],
      );
      if (applied.rowCount) continue;

      const migration = await readFile(resolve(migrationDirectory, name), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(migration);
        await client.query(
          "INSERT INTO editor_console_schema_migrations (name) VALUES ($1)",
          [name],
        );
        await client.query("COMMIT");
        appliedNames.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  return { appliedNames, knownNames: names };
}
