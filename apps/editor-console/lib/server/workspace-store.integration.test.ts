import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import type { DraftCommand, IssueBuild } from "../contracts";
import { mockIssueBuild } from "../mock-issue";
import { applyMigrations } from "../postgres-migrations";
import { PostgresWorkspaceStore, StaleDraftError } from "./workspace-store";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const isolatedDatabaseConfirmed =
  process.env.TEST_DATABASE_CONFIRMED_ISOLATED === "yes";
const integrationRequired = process.env.R8_REQUIRE_INTEGRATION_DB === "1";
const canRun = Boolean(testDatabaseUrl && isolatedDatabaseConfirmed);

if (
  testDatabaseUrl &&
  process.env.DATABASE_URL &&
  testDatabaseUrl === process.env.DATABASE_URL
) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
}

if (integrationRequired && !canRun) {
  throw new Error(
    "Set TEST_DATABASE_URL and TEST_DATABASE_CONFIRMED_ISOLATED=yes to run the PostgreSQL integration suite.",
  );
}

function fixtureBuild(
  mutate?: (build: IssueBuild) => void,
): IssueBuild {
  const build = structuredClone(mockIssueBuild);
  const suffix = crypto.randomUUID();
  build.id = crypto.randomUUID();
  build.issueKey = `integration-${suffix}`;
  build.issueDate = "2099-01-01";
  build.buildVersion = 1;
  build.bundleHash = `integration-${suffix}`;
  mutate?.(build);
  return build;
}

function command<T extends Omit<DraftCommand, "clientEventId" | "occurredAt">>(
  value: T,
): T & { clientEventId: string; occurredAt: string } {
  return {
    ...value,
    clientEventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  };
}

async function seedBuild(build: IssueBuild) {
  const sql = neon(testDatabaseUrl!);
  await sql`
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
  `;
}

describe.skipIf(!canRun)("PostgreSQL editor-console API boundary", () => {
  it("persists idempotent commands, immutable v1/v2 submissions, reopen, stale rejection, and slot-scoped undo", async () => {
    await applyMigrations(testDatabaseUrl!);
    const build = fixtureBuild();
    await seedBuild(build);
    const store = PostgresWorkspaceStore.connect(testDatabaseUrl!, "integration-editor");
    const initial = await store.loadWorkspaceForBuild(build.id);
    expect(initial).not.toBeNull();

    const firstReplace = command({
      type: "replace" as const,
      sectionId: "families" as const,
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    const replaced = await store.applyCommand(initial!.draft.id, 0, firstReplace);
    const duplicate = await store.applyCommand(initial!.draft.id, 0, firstReplace);
    expect(duplicate.draft.revision).toBe(1);

    await expect(
      store.applyCommand(
        initial!.draft.id,
        0,
        command({ type: "undo" as const }),
      ),
    ).rejects.toBeInstanceOf(StaleDraftError);
    const afterStale = await store.loadWorkspaceByDraftId(initial!.draft.id);
    expect(afterStale?.draft.revision).toBe(1);
    expect(afterStale?.events).toHaveLength(1);

    const preferred = await store.applyCommand(
      initial!.draft.id,
      replaced.draft.revision,
      command({
        type: "feedback" as const,
        sectionId: "families" as const,
        slotIndex: 0,
        value: "preferred" as const,
      }),
    );
    const submitId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const firstSubmit = await store.submitDraft(
      initial!.draft.id,
      preferred.draft.revision,
      submitId,
      submittedAt,
    );
    const duplicateSubmit = await store.submitDraft(
      initial!.draft.id,
      preferred.draft.revision,
      submitId,
      submittedAt,
    );
    expect(duplicateSubmit.submission.submissionId).toBe(
      firstSubmit.submission.submissionId,
    );
    expect(firstSubmit.submission).toMatchObject({
      issueKey: build.issueKey,
      issueBuildId: build.id,
      buildVersion: build.buildVersion,
      editorIdentity: "integration-editor",
      revision: 1,
    });
    expect(firstSubmit.submission.replacements[0]).toMatchObject({
      originalCandidateId: "fam-01",
      finalCandidateId: "fam-06",
      recordedReason: "preferred",
      feasible: true,
      provenanceComplete: true,
    });

    const restartedStore = PostgresWorkspaceStore.connect(
      testDatabaseUrl!,
      "integration-editor",
    );
    const restartedV1 = await restartedStore.loadWorkspaceForBuild(build.id);
    expect(restartedV1?.submission?.submissionId).toBe(
      firstSubmit.submission.submissionId,
    );

    const reopenId = crypto.randomUUID();
    const reopened = await restartedStore.reopenSubmission(
      firstSubmit.submission.submissionId,
      firstSubmit.draft.revision,
      reopenId,
      new Date().toISOString(),
    );
    const duplicateReopen = await restartedStore.reopenSubmission(
      firstSubmit.submission.submissionId,
      firstSubmit.draft.revision,
      reopenId,
      new Date().toISOString(),
    );
    expect(duplicateReopen.draft.id).toBe(reopened.draft.id);
    expect(reopened.draft).toMatchObject({
      issueRevision: 2,
      revision: 0,
      status: "draft",
      reopenedFromSubmissionId: firstSubmit.submission.submissionId,
    });

    const couplesReplace = await restartedStore.applyCommand(
      reopened.draft.id,
      0,
      command({
        type: "replace" as const,
        sectionId: "couples" as const,
        slotIndex: 0,
        alternativeCandidateId: "cou-06",
      }),
    );
    const familiesToC = await restartedStore.applyCommand(
      reopened.draft.id,
      couplesReplace.draft.revision,
      command({
        type: "replace" as const,
        sectionId: "families" as const,
        slotIndex: 0,
        alternativeCandidateId: "fam-08",
      }),
    );
    const unrelatedFeedback = await restartedStore.applyCommand(
      reopened.draft.id,
      familiesToC.draft.revision,
      command({
        type: "feedback" as const,
        sectionId: "couples" as const,
        slotIndex: 0,
        value: "preferred" as const,
      }),
    );
    const undone = await restartedStore.applyCommand(
      reopened.draft.id,
      unrelatedFeedback.draft.revision,
      command({ type: "undo" as const }),
    );
    expect(undone.draft.feedbackBySlot["couples:0"]).toBe("preferred");
    expect(undone.draft.selections.families[0].id).toBe("fam-06");

    const familiesToCAgain = await restartedStore.applyCommand(
      reopened.draft.id,
      undone.draft.revision,
      command({
        type: "replace" as const,
        sectionId: "families" as const,
        slotIndex: 0,
        alternativeCandidateId: "fam-08",
      }),
    );
    const familiesPreferred = await restartedStore.applyCommand(
      reopened.draft.id,
      familiesToCAgain.draft.revision,
      command({
        type: "feedback" as const,
        sectionId: "families" as const,
        slotIndex: 0,
        value: "preferred" as const,
      }),
    );
    const secondSubmit = await restartedStore.submitDraft(
      reopened.draft.id,
      familiesPreferred.draft.revision,
      crypto.randomUUID(),
      new Date().toISOString(),
    );

    const submissions = await restartedStore.listSubmissions(build.id);
    expect(submissions.map((submission) => submission.revision)).toEqual([1, 2]);
    expect(submissions[0].submissionId).toBe(firstSubmit.submission.submissionId);
    expect(submissions[0].finalSelections.families[0].id).toBe("fam-06");
    expect(submissions[1].submissionId).toBe(secondSubmit.submission.submissionId);
    expect(
      submissions[1].trainingPairs.filter(
        (pair) =>
          pair.rejectedCandidateId === "fam-01" &&
          pair.preferredCandidateId === "fam-08",
      ),
    ).toHaveLength(1);

    const sql = neon(testDatabaseUrl!);
    const currentRows = await sql`
      SELECT count(*)::integer AS count
      FROM drafts
      WHERE issue_build_id = ${build.id}::uuid AND is_current
    `;
    expect(currentRows[0].count).toBe(1);
    const restartedV2 = await PostgresWorkspaceStore.connect(
      testDatabaseUrl!,
      "integration-editor",
    ).loadWorkspaceForBuild(build.id);
    expect(restartedV2?.submission?.submissionId).toBe(
      secondSubmit.submission.submissionId,
    );
    expect(restartedV2?.submissionHistory).toHaveLength(2);
  });

  it("excludes unavailable and provenance-incomplete final comparisons", async () => {
    await applyMigrations(testDatabaseUrl!);

    for (const finalAssessment of ["unavailable", "missing"] as const) {
      const build = fixtureBuild((value) => {
        if (finalAssessment === "unavailable") {
          value.sections[0].replacementAssessments["fam-01"]["fam-08"] = {
            status: "unavailable",
            reason: "The final candidate cannot replace the original in this slate.",
          };
        } else {
          delete value.sections[0].replacementAssessments["fam-01"]["fam-08"];
        }
      });
      await seedBuild(build);
      const store = PostgresWorkspaceStore.connect(
        testDatabaseUrl!,
        "integration-editor",
      );
      const initial = (await store.loadWorkspaceForBuild(build.id))!;
      const first = await store.applyCommand(
        initial.draft.id,
        0,
        command({
          type: "replace" as const,
          sectionId: "families" as const,
          slotIndex: 0,
          alternativeCandidateId: "fam-06",
        }),
      );
      const second = await store.applyCommand(
        initial.draft.id,
        first.draft.revision,
        command({
          type: "replace" as const,
          sectionId: "families" as const,
          slotIndex: 0,
          alternativeCandidateId: "fam-08",
        }),
      );
      const feedback = await store.applyCommand(
        initial.draft.id,
        second.draft.revision,
        command({
          type: "feedback" as const,
          sectionId: "families" as const,
          slotIndex: 0,
          value: "preferred" as const,
        }),
      );
      const submitted = await store.submitDraft(
        initial.draft.id,
        feedback.draft.revision,
        crypto.randomUUID(),
        new Date().toISOString(),
      );

      expect(submitted.submission.trainingPairs).toEqual([]);
      expect(submitted.submission.replacements[0].provenanceComplete).toBe(
        finalAssessment !== "missing",
      );
      expect(submitted.submission.replacements[0].feasible).toBe(false);
    }
  });
});
