import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";

import type { IssueBuild } from "../lib/contracts";
import {
  parseBundle,
  publishBuild,
  type EditableDraftRef,
  type PublishedBuildRef,
  type PublishStore,
} from "../lib/publish-build";

// Usage: npm run publish-build -- <bundle.json> [--apply]
// Dry run by default: the bundle is checked, and with DATABASE_URL set the database is
// read for conflicts. --apply inserts the build. A published build cannot be removed.

function neonStore(connectionString: string): PublishStore {
  const sql = neon(connectionString);
  const ref = (row: {
    id: string;
    issue_key: string;
    build_version: number;
    bundle_hash: string;
  }): PublishedBuildRef => ({
    id: row.id,
    issueKey: row.issue_key,
    buildVersion: row.build_version,
    bundleHash: row.bundle_hash,
  });

  return {
    async findBuildByHash(bundleHash) {
      const rows = (await sql`
        SELECT id, issue_key, build_version, bundle_hash
        FROM issue_builds
        WHERE bundle_hash = ${bundleHash}
        LIMIT 1
      `) as unknown as Array<Parameters<typeof ref>[0]>;
      return rows[0] ? ref(rows[0]) : null;
    },
    async findBuildByVersion(issueKey, buildVersion) {
      const rows = (await sql`
        SELECT id, issue_key, build_version, bundle_hash
        FROM issue_builds
        WHERE issue_key = ${issueKey}
          AND build_version = ${buildVersion}
        LIMIT 1
      `) as unknown as Array<Parameters<typeof ref>[0]>;
      return rows[0] ? ref(rows[0]) : null;
    },
    async editableDraftsForIssue(issueKey) {
      const rows = (await sql`
        SELECT d.id AS draft_id, b.id AS build_id, b.build_version
        FROM drafts d
        JOIN issue_builds b ON b.id = d.issue_build_id
        WHERE b.issue_key = ${issueKey}
          AND d.status = 'draft'
        ORDER BY b.build_version
      `) as unknown as Array<{
        draft_id: string;
        build_id: string;
        build_version: number;
      }>;
      return rows.map(
        (row): EditableDraftRef => ({
          draftId: row.draft_id,
          buildId: row.build_id,
          buildVersion: row.build_version,
        }),
      );
    },
    async insertBuild(build: IssueBuild) {
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
          ${build.id}::uuid,
          ${build.issueKey},
          ${build.issueDate}::date,
          ${build.buildVersion},
          ${build.contractVersion},
          ${build.bundleHash},
          ${JSON.stringify(build)}::jsonb
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      return inserted.length > 0;
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const files = args.filter((arg) => !arg.startsWith("--"));
  const unknown = args.filter((arg) => arg.startsWith("--") && arg !== "--apply");
  if (files.length !== 1 || unknown.length) {
    throw new Error("Usage: npm run publish-build -- <bundle.json> [--apply]");
  }

  const file = resolve(process.cwd(), files[0]);
  const input: unknown = JSON.parse(await readFile(file, "utf8"));

  loadEnvConfig(process.cwd(), true);
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    if (apply) {
      throw new Error("DATABASE_URL is required in apps/editor-console/.env.local.");
    }
    const build = parseBundle(input);
    console.log(
      `Bundle is valid: ${build.issueKey} version ${build.buildVersion} (build ${build.id}).`,
    );
    console.log("Database checks NOT run: DATABASE_URL is not set. Nothing was written.");
    return;
  }

  const { status, build } = await publishBuild(input, neonStore(connectionString), {
    apply,
  });
  const name = `${build.issueKey} version ${build.buildVersion} (build ${build.id})`;
  if (status === "published") console.log(`Published ${name}.`);
  else if (status === "already_published") {
    console.log(`Already published, nothing written: ${name}.`);
  } else {
    console.log(`Dry run, nothing written. Would publish ${name}. Add --apply to insert it.`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Publish failed.");
  process.exitCode = 1;
});
