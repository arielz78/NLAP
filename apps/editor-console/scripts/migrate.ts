import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd(), true);

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required in apps/editor-console/.env.local.");
  }

  const migrationPath = resolve(
    process.cwd(),
    "db/migrations/0001_editor_console.sql",
  );
  const migration = await readFile(migrationPath, "utf8");
  const pool = new Pool({ connectionString });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS editor_console_schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await pool.query(
      "SELECT name FROM editor_console_schema_migrations WHERE name = $1",
      ["0001_editor_console.sql"],
    );

    if (applied.rowCount) {
      console.log("0001_editor_console.sql is already applied.");
    } else {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(migration);
        await client.query(
          "INSERT INTO editor_console_schema_migrations (name) VALUES ($1)",
          ["0001_editor_console.sql"],
        );
        await client.query("COMMIT");
        console.log("Applied 0001_editor_console.sql");
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
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
