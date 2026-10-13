import { createHash } from "node:crypto";

import { z } from "zod";

import { sectionIds, type IssueBuild } from "./contracts";

/**
 * Publishing an issue build (ship-plan item 10): check a bundle written by
 * scripts/issue-build/to-bundle.js, then insert it into issue_builds. Rows there
 * are immutable (the table rejects UPDATE and DELETE), so every check runs before
 * the insert and nothing is ever replaced.
 */

const SELECTED_PER_SECTION = 5;
const CONTRACT_VERSION = "r8.editor-console.v1";

export class PublishRefusedError extends Error {
  constructor(readonly problems: string[]) {
    super(`Cannot publish this build:\n- ${problems.join("\n- ")}`);
  }
}

const filled = z.string().regex(/\S/, "must not be blank");

const candidateSchema = z.strictObject({
  id: filled,
  seriesId: filled,
  occurrenceId: filled,
  title: filled,
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}.*)?$/, "must be a date or a date and time"),
  venue: z.string(),
  city: z.string(),
  description: filled,
  sourceLabel: filled,
  sourceUrl: z.string().url(),
  // "unclassified" is a legal contract value and is refused here on purpose.
  classification: z.literal("classified"),
});

const assessmentSchema = z.strictObject({
  status: z.enum(["clean", "override", "unavailable"]),
  reason: filled,
});

const sectionSchema = z.strictObject({
  id: z.enum(sectionIds),
  label: filled,
  selected: z.array(candidateSchema),
  alternatives: z.array(
    z.strictObject({
      candidate: candidateSchema,
      orderingPosition: z.number().int().positive(),
    }),
  ),
  replacementAssessments: z.record(
    z.string(),
    z.record(z.string(), assessmentSchema),
  ),
});

const issueBuildSchema = z.strictObject({
  id: z.string().uuid(),
  issueKey: filled,
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be date-only"),
  buildVersion: z.number().int().positive(),
  contractVersion: z.literal(CONTRACT_VERSION),
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/, "must be a SHA-256 hex digest"),
  ordering: z.strictObject({
    adapterVersion: filled,
    rankerVersion: filled,
    evidenceVersion: filled,
    generatedAt: filled,
    inputHash: filled,
  }),
  sections: z.array(sectionSchema),
});

// Same form as to-bundle.js canonicalJSON: object keys sorted, array order kept,
// two-space indent, one trailing newline. The test file holds the two together.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonical(source[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

/** SHA-256 of the canonical bundle with bundleHash left out (to-bundle.js's self-hash). */
export function bundleSelfHash(bundle: object): string {
  const body = { ...(bundle as Record<string, unknown>) };
  delete body.bundleHash;
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

/** Every problem is collected before refusing, so one run names them all. */
export function parseBundle(input: unknown): IssueBuild {
  const parsed = issueBuildSchema.safeParse(input);
  if (!parsed.success) {
    throw new PublishRefusedError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "bundle"}: ${issue.message}`,
      ),
    );
  }

  const build = parsed.data;
  const problems: string[] = [];

  for (const id of sectionIds) {
    const count = build.sections.filter((section) => section.id === id).length;
    if (count === 0) problems.push(`Missing section: ${id}`);
    if (count > 1) problems.push(`Duplicate section: ${id}`);
  }

  for (const section of build.sections) {
    if (section.selected.length !== SELECTED_PER_SECTION) {
      problems.push(
        `${section.id}: ${section.selected.length} of ${SELECTED_PER_SECTION} picks (exactly five required)`,
      );
    }
    const ids = [
      ...section.selected.map((candidate) => candidate.id),
      ...section.alternatives.map((alternative) => alternative.candidate.id),
    ];
    if (new Set(ids).size !== ids.length) {
      problems.push(`${section.id}: the same candidate is displayed twice`);
    }
    if (
      section.alternatives.some(
        (alternative, index) => alternative.orderingPosition !== index + 1,
      )
    ) {
      problems.push(`${section.id}: alternatives must be numbered 1, 2, 3 in order`);
    }
  }

  if (bundleSelfHash(build) !== build.bundleHash) {
    problems.push(
      "bundleHash does not match the bundle's content: the file was changed after to-bundle.js wrote it",
    );
  }

  if (problems.length) throw new PublishRefusedError(problems);
  return build;
}

export interface PublishedBuildRef {
  id: string;
  issueKey: string;
  buildVersion: number;
  bundleHash: string;
}

export interface EditableDraftRef {
  draftId: string;
  buildId: string;
  buildVersion: number;
}

export interface PublishStore {
  findBuildByHash(bundleHash: string): Promise<PublishedBuildRef | null>;
  findBuildByVersion(
    issueKey: string,
    buildVersion: number,
  ): Promise<PublishedBuildRef | null>;
  /** Drafts with status 'draft' on any build of this issue. */
  editableDraftsForIssue(issueKey: string): Promise<EditableDraftRef[]>;
  /** False when the row was not inserted because a unique constraint already held. */
  insertBuild(build: IssueBuild): Promise<boolean>;
}

export interface PublishResult {
  status: "published" | "already_published" | "would_publish";
  build: IssueBuild;
}

function sameBuild(existing: PublishedBuildRef, build: IssueBuild) {
  return (
    existing.id === build.id &&
    existing.issueKey === build.issueKey &&
    existing.buildVersion === build.buildVersion &&
    existing.bundleHash === build.bundleHash
  );
}

async function existingBuild(
  build: IssueBuild,
  store: PublishStore,
): Promise<"same" | "none"> {
  const byHash = await store.findBuildByHash(build.bundleHash);
  if (byHash) {
    if (sameBuild(byHash, build)) return "same";
    throw new PublishRefusedError([
      `This bundle's content is already published under another identity (build ${byHash.id}, ${byHash.issueKey} version ${byHash.buildVersion}).`,
    ]);
  }

  const byVersion = await store.findBuildByVersion(build.issueKey, build.buildVersion);
  if (byVersion) {
    throw new PublishRefusedError([
      `${build.issueKey} version ${build.buildVersion} is already published with different content (build ${byVersion.id}). A published build is never replaced: finalize a new run to get the next build_version.`,
    ]);
  }

  return "none";
}

export async function publishBuild(
  input: unknown,
  store: PublishStore,
  options: { apply: boolean },
): Promise<PublishResult> {
  const build = parseBundle(input);

  if ((await existingBuild(build, store)) === "same") {
    return { status: "already_published", build };
  }

  const editable = (await store.editableDraftsForIssue(build.issueKey)).filter(
    (draft) => draft.buildId !== build.id,
  );
  if (editable.length) {
    throw new PublishRefusedError(
      editable.map(
        (draft) =>
          `${build.issueKey} version ${draft.buildVersion} has a draft still open for editing (draft ${draft.draftId}). Publishing now would move the editor onto a new build mid-edit.`,
      ),
    );
  }

  if (!options.apply) return { status: "would_publish", build };

  if (await store.insertBuild(build)) return { status: "published", build };

  // The insert met a unique constraint: another publish landed between the checks and the write.
  if ((await existingBuild(build, store)) === "same") {
    return { status: "already_published", build };
  }
  throw new PublishRefusedError([
    "The build was not inserted and no matching row was found. Run the command again.",
  ]);
}
