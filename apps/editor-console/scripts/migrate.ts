import { loadEnvConfig } from "@next/env";

import { applyMigrations } from "../lib/postgres-migrations";

async function main() {
  loadEnvConfig(process.cwd(), true);

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required in apps/editor-console/.env.local.");
  }

  const result = await applyMigrations(connectionString);
  if (result.appliedNames.length === 0) {
    console.log(`Schema is current (${result.knownNames.length} migrations).`);
  } else {
    for (const name of result.appliedNames) {
      console.log(`Applied ${name}`);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
