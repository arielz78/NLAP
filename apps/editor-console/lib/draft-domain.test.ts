import { describe, expect, it } from "vitest";

import type {
  DraftSnapshot,
  EditorWorkspace,
  InteractionEvent,
  IssueBuild,
  SelfFilledEvent,
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

const ownEvent: SelfFilledEvent = {
  title: "Harvest Lantern Walk",
  url: "https://example.org/lantern-walk",
  date: "2026-10-25",
  description: "Evening walk through the conservation area.",
};

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

describe("slots the editor fills himself", () => {
  function selfFill(
    draft: DraftSnapshot,
    slotIndex: number,
    selfFilled: boolean,
    sectionId: "families" | "couples" | "golden-age" = "families",
    event?: SelfFilledEvent,
  ) {
    return applyDraftCommand(mockIssueBuild, draft, {
      ...eventBase(),
      type: "self_fill",
      sectionId,
      slotIndex,
      selfFilled,
      ...(event ? { event } : {}),
    });
  }

  it("marks a slot, keeps the pick underneath, and records the event", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const marked = selfFill(initial, 2, true);

    expect(initial.selfFilledSlots).toEqual([]);
    expect(marked.draft.selfFilledSlots).toEqual([
      { sectionId: "families", slotIndex: 2 },
    ]);
    expect(marked.draft.selections.families[2].id).toBe("fam-03");
    expect(marked.draft.revision).toBe(1);
    expect(marked.event).toMatchObject({
      type: "self_fill",
      draftRevision: 1,
      incomplete: false,
      payload: {
        sectionId: "families",
        slotIndex: 2,
        selfFilled: true,
        candidateId: "fam-03",
      },
    });
  });

  it("unmarking restores the slot, and marking twice does not repeat it", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const marked = selfFill(initial, 2, true);
    const again = selfFill(marked.draft, 2, true);
    const unmarked = selfFill(again.draft, 2, false);

    expect(again.draft.selfFilledSlots).toHaveLength(1);
    expect(unmarked.draft.selfFilledSlots).toEqual([]);
    expect(unmarked.draft.selections.families[2].id).toBe("fam-03");
  });

  it("refuses a slot that does not exist", () => {
    const initial = createInitialDraft(mockIssueBuild);
    expect(() => selfFill(initial, 9, true)).toThrow();
  });

  it("refuses to replace a marked slot until it is unmarked", () => {
    const marked = selfFill(createInitialDraft(mockIssueBuild), 0, true);
    const replace = (draft: DraftSnapshot) =>
      applyDraftCommand(mockIssueBuild, draft, {
        ...eventBase(),
        type: "replace",
        sectionId: "families",
        slotIndex: 0,
        alternativeCandidateId: "fam-06",
      });

    expect(() => replace(marked.draft)).toThrow(/filling this slot yourself/);
    const unmarked = selfFill(marked.draft, 0, false);
    expect(replace(unmarked.draft).draft.selections.families[0].id).toBe("fam-06");
  });

  it("works on a draft saved before the field existed", () => {
    const legacy = createInitialDraft(mockIssueBuild);
    delete legacy.selfFilledSlots;

    expect(selfFill(legacy, 1, true).draft.selfFilledSlots).toEqual([
      { sectionId: "families", slotIndex: 1 },
    ]);
    expect(submit(workspace(legacy, [])).selfFilledSlots).toEqual([]);
  });

  it("lists marked slots on the submission in section and slot order", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const first = selfFill(initial, 4, true, "golden-age", ownEvent);
    const second = selfFill(first.draft, 3, true, "families", ownEvent);
    const third = selfFill(second.draft, 1, true, "families", ownEvent);
    const submission = submit(
      workspace(third.draft, [first.event, second.event, third.event]),
    );

    expect(submission.selfFilledSlots).toEqual([
      { sectionId: "families", slotIndex: 1, event: ownEvent },
      { sectionId: "families", slotIndex: 3, event: ownEvent },
      { sectionId: "golden-age", slotIndex: 4, event: ownEvent },
    ]);
    expect(submission.finalSelections.families).toHaveLength(5);
  });

  it("a swapped slot he then fills himself records no replacement and no pair", () => {
    const initial = createInitialDraft(mockIssueBuild);
    const swap = (draft: DraftSnapshot, slotIndex: number, id: string) =>
      applyDraftCommand(mockIssueBuild, draft, {
        ...eventBase(),
        type: "replace",
        sectionId: "families",
        slotIndex,
        alternativeCandidateId: id,
      });
    const prefer = (draft: DraftSnapshot, slotIndex: number) =>
      applyDraftCommand(mockIssueBuild, draft, {
        ...eventBase(),
        type: "feedback",
        sectionId: "families",
        slotIndex,
        value: "preferred",
      });

    const swapA = swap(initial, 0, "fam-06");
    const preferA = prefer(swapA.draft, 0);
    const swapB = swap(preferA.draft, 1, "fam-08");
    const preferB = prefer(swapB.draft, 1);
    const marked = selfFill(preferB.draft, 0, true, "families", ownEvent);
    const submission = submit(
      workspace(marked.draft, [
        swapA.event,
        preferA.event,
        swapB.event,
        preferB.event,
        marked.event,
      ]),
    );

    // Slot 0 is his own event now, so its swap says nothing; slot 1's swap still counts.
    expect(submission.replacements.map((item) => item.slotIndex)).toEqual([1]);
    expect(submission.trainingPairs).toEqual([
      {
        sectionId: "families",
        slotIndex: 1,
        rejectedCandidateId: "fam-02",
        preferredCandidateId: "fam-08",
        feedback: "preferred",
      },
    ]);
  });
});

describe("typing in a self-filled event (Decision_Log §113)", () => {
  function fill(
    draft: DraftSnapshot,
    slotIndex: number,
    selfFilled: boolean,
    event?: SelfFilledEvent,
  ) {
    return applyDraftCommand(mockIssueBuild, draft, {
      ...eventBase(),
      type: "self_fill",
      sectionId: "couples",
      slotIndex,
      selfFilled,
      ...(event ? { event } : {}),
    });
  }

  it("stores the typed event on the slot and in the recorded event", () => {
    const marked = fill(createInitialDraft(mockIssueBuild), 2, true);
    const typed = fill(marked.draft, 2, true, ownEvent);

    expect(typed.draft.selfFilledSlots).toEqual([
      { sectionId: "couples", slotIndex: 2, event: ownEvent },
    ]);
    expect(typed.event.payload).toMatchObject({ selfFilled: true, event: ownEvent });
  });

  it("keeps typed details when the slot is marked again without them", () => {
    const typed = fill(createInitialDraft(mockIssueBuild), 2, true, ownEvent);
    const remarked = fill(typed.draft, 2, true);

    expect(remarked.draft.selfFilledSlots).toEqual([
      { sectionId: "couples", slotIndex: 2, event: ownEvent },
    ]);
  });

  it("unmarking the slot drops what was typed", () => {
    const typed = fill(createInitialDraft(mockIssueBuild), 2, true, ownEvent);
    const unmarked = fill(typed.draft, 2, false);
    const marked = fill(unmarked.draft, 2, true);

    expect(unmarked.draft.selfFilledSlots).toEqual([]);
    expect(marked.draft.selfFilledSlots).toEqual([{ sectionId: "couples", slotIndex: 2 }]);
  });

  it("refuses to submit while a marked slot is missing title, link or date", () => {
    const marked = fill(createInitialDraft(mockIssueBuild), 2, true);
    expect(() => submit(workspace(marked.draft, [marked.event]))).toThrow(
      /Couples slot 3/,
    );

    for (const missing of ["title", "url", "date"] as const) {
      const partial = { ...ownEvent, [missing]: "  " };
      const typed = fill(createInitialDraft(mockIssueBuild), 2, true, partial);
      expect(() => submit(workspace(typed.draft, [typed.event]))).toThrow(
        /title, link and date/,
      );
    }
  });

  it("submits once every marked slot is complete; the description is optional", () => {
    const withoutDescription: SelfFilledEvent = {
      title: ownEvent.title,
      url: ownEvent.url,
      date: ownEvent.date,
    };
    const typed = fill(createInitialDraft(mockIssueBuild), 2, true, withoutDescription);
    const submission = submit(workspace(typed.draft, [typed.event]));

    expect(submission.selfFilledSlots).toEqual([
      { sectionId: "couples", slotIndex: 2, event: withoutDescription },
    ]);
  });
});
