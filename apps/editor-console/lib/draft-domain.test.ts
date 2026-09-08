import { describe, expect, it } from "vitest";

import { applyDraftCommand, createInitialDraft, createSubmission } from "./draft-domain";
import { mockIssueBuild } from "./mock-issue";

function eventBase() {
  return {
    clientEventId: crypto.randomUUID(),
    occurredAt: "2026-09-08T18:00:00.000Z",
  };
}

describe("editor draft domain", () => {
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
    const workspace = {
      build: mockIssueBuild,
      draft: undone.draft,
      events: [replacement.event, undone.event],
      persistence: "browser-demo" as const,
    };

    expect(undone.draft.selections.families[0].id).toBe("fam-01");
    expect(createSubmission(workspace).trainingPairs).toEqual([]);
  });

  it("derives one final pair after A to B to C", () => {
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
    const workspace = {
      build: mockIssueBuild,
      draft: feedback.draft,
      events: [first.event, second.event, feedback.event],
      persistence: "browser-demo" as const,
    };

    expect(createSubmission(workspace).trainingPairs).toEqual([
      {
        sectionId: "families",
        slotIndex: 0,
        rejectedCandidateId: "fam-01",
        preferredCandidateId: "fam-08",
        feedback: "preferred",
      },
    ]);
  });

  it("blocks a replacement marked unavailable", () => {
    const initial = createInitialDraft(mockIssueBuild);

    expect(() =>
      applyDraftCommand(mockIssueBuild, initial, {
        ...eventBase(),
        type: "replace",
        sectionId: "families",
        slotIndex: 3,
        alternativeCandidateId: "fam-09",
      }),
    ).toThrow("same upstream series");
  });
});
