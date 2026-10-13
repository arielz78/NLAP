import { describe, expect, it } from "vitest";

import type {
  DraftSnapshot,
  EditorWorkspace,
  InteractionEvent,
  IssueBuild,
} from "./contracts";
import {
  applyDraftCommand,
  createInitialDraft,
  createReopenedDraft,
  createSubmission,
} from "./draft-domain";
import { mockIssueBuild } from "./mock-issue";

function eventBase() {
  return {
    clientEventId: crypto.randomUUID(),
    occurredAt: "2026-09-08T18:00:00.000Z",
  };
}

function workspace(
  draft: DraftSnapshot,
  events: InteractionEvent[],
  build: IssueBuild = mockIssueBuild,
  additional: Partial<EditorWorkspace> = {},
): EditorWorkspace {
  return {
    build,
    draft,
    events,
    persistence: "browser-demo",
    submissionHistory: [],
    ...additional,
  };
}

function submit(
  value: EditorWorkspace,
  submitClientEventId = crypto.randomUUID(),
) {
  return createSubmission(value, {
    submitClientEventId,
    editorIdentity: value.draft.editorIdentity,
    submittedAt: "2026-09-08T18:05:00.000Z",
  });
}

describe("editor draft domain", () => {
  it("uses long, source-style fixture copy without placeholder link labels", () => {
    const candidates = mockIssueBuild.sections.flatMap((section) => [
      ...section.selected,
      ...section.alternatives.map((alternative) => alternative.candidate),
    ]);

    expect(candidates.every((candidate) => candidate.sourceLabel === "View event")).toBe(
      true,
    );
    expect(candidates.every((candidate) => candidate.description.length > 180)).toBe(
      true,
    );
    expect(candidates.some((candidate) => candidate.title.length > 85)).toBe(true);
  });

  it("replaces and undoes without producing a final preference pair", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const replacement = applyDraftCommand(mockIssueBuild, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    const undone = applyDraftCommand(mockIssueBuild, replacement.draft, {
      ...eventBase(),
      type: "undo",
    });
    const value = workspace(undone.draft, [replacement.event, undone.event]);

    expect(undone.draft.selections.families[0].id).toBe("fam-01");
    expect(submit(value).trainingPairs).toEqual([]);
  });

  it("derives exactly one final pair after a provenance-complete A to B to C", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const first = applyDraftCommand(mockIssueBuild, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    const second = applyDraftCommand(mockIssueBuild, first.draft, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-08",
    });
    const feedback = applyDraftCommand(mockIssueBuild, second.draft, {
      ...eventBase(),
      type: "feedback",
      sectionId: "families",
      slotIndex: 0,
      value: "preferred",
    });
    const value = workspace(feedback.draft, [
      first.event,
      second.event,
      feedback.event,
    ]);

    expect(submit(value).trainingPairs).toEqual([
      {
        sectionId: "families",
        slotIndex: 0,
        rejectedCandidateId: "fam-01",
        preferredCandidateId: "fam-08",
        feedback: "preferred",
      },
    ]);
  });

  it("records the verdict shown at the swap, whatever the bundle's table says", () => {
    const build = structuredClone(mockIssueBuild);
    build.sections[0].replacementAssessments["fam-01"]["fam-08"] = {
      status: "unavailable",
      reason: "C cannot replace A while the original slate remains fixed.",
    };
    const first = applyDraftCommand(build, createInitialDraft(build), {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    const second = applyDraftCommand(build, first.draft, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-08",
    });
    const feedback = applyDraftCommand(build, second.draft, {
      ...eventBase(),
      type: "feedback",
      sectionId: "families",
      slotIndex: 0,
      value: "preferred",
    });
    const submission = submit(
      workspace(feedback.draft, [first.event, second.event, feedback.event], build),
    );

    expect(second.event.payload.assessment).toEqual({
      status: "clean",
      reason: "Fits this slot.",
    });
    expect(submission.replacements).toMatchObject([
      {
        originalCandidateId: "fam-01",
        finalCandidateId: "fam-08",
        assessment: second.event.payload.assessment,
        feasible: true,
      },
    ]);
    expect(submission.trainingPairs).toHaveLength(1);
  });

  it("carries a warning into the record and still derives the pair", () => {
    const build = structuredClone(mockIssueBuild);
    build.sections[0].alternatives[0].candidate.venue =
      build.sections[0].selected[2].venue;
    const replacement = applyDraftCommand(build, createInitialDraft(build), {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    const feedback = applyDraftCommand(build, replacement.draft, {
      ...eventBase(),
      type: "feedback",
      sectionId: "families",
      slotIndex: 0,
      value: "preferred",
    });
    const submission = submit(
      workspace(feedback.draft, [replacement.event, feedback.event], build),
    );

    expect(submission.replacements[0].assessment).toEqual({
      status: "override",
      reason: `Same venue as pick 3: ${build.sections[0].selected[2].venue}.`,
    });
    expect(submission.replacements[0].feasible).toBe(true);
    expect(submission.trainingPairs).toHaveLength(1);
  });

  it("records no verdict and derives no pair when the swap event is missing", () => {
    const replacement = applyDraftCommand(
      mockIssueBuild,
      createInitialDraft(mockIssueBuild),
      {
        ...eventBase(),
        type: "replace",
        sectionId: "families",
        slotIndex: 0,
        alternativeCandidateId: "fam-06",
      },
    );
    const feedback = applyDraftCommand(mockIssueBuild, replacement.draft, {
      ...eventBase(),
      type: "feedback",
      sectionId: "families",
      slotIndex: 0,
      value: "preferred",
    });
    const submission = submit(workspace(feedback.draft, [feedback.event]));

    expect(submission.replacements).toMatchObject([
      { assessment: null, feasible: false, provenanceComplete: false },
    ]);
    expect(submission.trainingPairs).toEqual([]);
  });

  it("excludes a preferred comparison when interaction provenance is incomplete", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const replacement = applyDraftCommand(mockIssueBuild, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    delete replacement.event.payload.displayedAlternatives;
    const feedback = applyDraftCommand(mockIssueBuild, replacement.draft, {
      ...eventBase(),
      type: "feedback",
      sectionId: "families",
      slotIndex: 0,
      value: "preferred",
    });
    const submission = submit(
      workspace(feedback.draft, [replacement.event, feedback.event]),
    );

    expect(submission.replacements[0].provenanceComplete).toBe(false);
    expect(submission.trainingPairs).toEqual([]);
  });

  it("undoes only the replacement slot and preserves later unrelated feedback", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const couplesReplacement = applyDraftCommand(mockIssueBuild, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "couples",
      slotIndex: 0,
      alternativeCandidateId: "cou-06",
    });
    const familiesReplacement = applyDraftCommand(
      mockIssueBuild,
      couplesReplacement.draft,
      {
        ...eventBase(),
        type: "replace",
        sectionId: "families",
        slotIndex: 0,
        alternativeCandidateId: "fam-06",
      },
    );
    const unrelatedFeedback = applyDraftCommand(
      mockIssueBuild,
      familiesReplacement.draft,
      {
        ...eventBase(),
        type: "feedback",
        sectionId: "couples",
        slotIndex: 0,
        value: "preferred",
      },
    );
    const undone = applyDraftCommand(mockIssueBuild, unrelatedFeedback.draft, {
      ...eventBase(),
      type: "undo",
    });

    expect(undone.draft.selections.families[0].id).toBe("fam-01");
    expect(undone.draft.selections.couples[0].id).toBe("cou-06");
    expect(undone.draft.feedbackBySlot["couples:0"]).toBe("preferred");
  });

  it("reopens a submitted revision without mutating the prior submission", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const replacement = applyDraftCommand(mockIssueBuild, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });
    const feedback = applyDraftCommand(mockIssueBuild, replacement.draft, {
      ...eventBase(),
      type: "feedback",
      sectionId: "families",
      slotIndex: 0,
      value: "preferred",
    });
    const beforeSubmit = workspace(feedback.draft, [
      replacement.event,
      feedback.event,
    ]);
    const firstSubmission = submit(beforeSubmit);
    const submittedDraft: DraftSnapshot = {
      ...feedback.draft,
      revision: feedback.draft.revision + 1,
      status: "submitted",
    };
    const submittedWorkspace = workspace(submittedDraft, beforeSubmit.events, mockIssueBuild, {
      submission: firstSubmission,
      submissionHistory: [firstSubmission],
    });
    const reopened = createReopenedDraft(submittedWorkspace, {
      editorIdentity: "fixture-editor",
      reopenedAt: "2026-09-08T19:00:00.000Z",
    });

    expect(firstSubmission.revision).toBe(1);
    expect(firstSubmission.finalSelections.families[0].id).toBe("fam-06");
    expect(reopened).toMatchObject({
      issueRevision: 2,
      revision: 0,
      status: "draft",
      reopenedFromSubmissionId: firstSubmission.submissionId,
    });
    expect(reopened.selections.families[0].id).toBe("fam-06");
  });

  it("never refuses a replacement, even one the bundle marked unavailable", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const result = applyDraftCommand(mockIssueBuild, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 3,
      alternativeCandidateId: "fam-09",
    });

    expect(result.draft.selections.families[3].id).toBe("fam-09");
  });
});
