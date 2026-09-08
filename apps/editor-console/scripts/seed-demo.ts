import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";

import { mockIssueBuild } from "../lib/mock-issue";

async function main() {
  loadEnvConfig(process.cwd(), true);

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required in apps/editor-console/.env.local.");
  }

  const sql = neon(connectionString);
  const inserted = await sql`
    INSERT INTO issue_builds (
      id,
      issue_key,
      issue_date,
      build_version,
      contract_version,
      bundle_hash,
      bundle
    )
    VALUES (
      ${mockIssueBuild.id}::uuid,
      ${mockIssueBuild.issueKey},
      ${mockIssueBuild.issueDate}::date,
      ${mockIssueBuild.buildVersion},
      ${mockIssueBuild.contractVersion},
      ${mockIssueBuild.bundleHash},
      ${JSON.stringify(mockIssueBuild)}::jsonb
    )
    ON CONFLICT (issue_key, build_version) DO NOTHING
    RETURNING id
  `;

  console.log(
    inserted.length
      ? "Inserted demo issue build."
      : "Demo issue build already exists.",
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
});
