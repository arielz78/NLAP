import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Candidate, IssueBuild } from "./contracts";
import { applyDraftCommand, createInitialDraft } from "./draft-domain";
import { mockIssueBuild } from "./mock-issue";
import { assessReplacement, venueKey } from "./replacement-rules";

const sharedCases = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../scripts/venue_match_cases.json", import.meta.url),
    ),
    "utf8",
  ),
) as { cases: Array<{ a: string; b: string; same: boolean }> };

function eventBase() {
  return {
    clientEventId: crypto.randomUUID(),
    occurredAt: "2026-09-08T18:00:00.000Z",
  };
}

/** A copy of the fixture in which the named candidates carry the given fields. */
function buildWith(changes: Record<string, Partial<Candidate>>): IssueBuild {
  const build = structuredClone(mockIssueBuild);
  for (const section of build.sections) {
    for (const item of [
      ...section.selected,
      ...section.alternatives.map((alternative) => alternative.candidate),
    ]) {
      Object.assign(item, changes[item.id] ?? {});
    }
  }
  return build;
}

describe("venue matching", () => {
  it("agrees with the cases shared with the allocator", () => {
    expect(sharedCases.cases.length).toBeGreaterThan(0);
    for (const { a, b, same } of sharedCases.cases) {
      expect(
        venueKey(a) !== "" && venueKey(a) === venueKey(b),
        `"${a}" vs "${b}"`,
      ).toBe(same);
    }
  });
});

describe("replacement checks against the current lineup", () => {
  it("is clean when nothing in the lineup repeats", () => {
    const draft = createInitialDraft(mockIssueBuild);
    const incoming = draft.alternatives.families[0].candidate;

    expect(
      assessReplacement(mockIssueBuild, draft.selections, "families", 0, incoming),
    ).toEqual({ status: "clean", reason: "Fits this slot." });
  });

  it("warns on a venue already in the section, naming the pick", () => {
    const build = buildWith({
      "fam-03": { venue: "Example Hall" },
      "fam-06": { venue: " example  hall " },
    });
    const draft = createInitialDraft(build);
    const incoming = draft.alternatives.families[0].candidate;

    expect(
      assessReplacement(build, draft.selections, "families", 0, incoming),
    ).toEqual({
      status: "override",
      reason: "Same venue as pick 3: Example Hall.",
    });
  });

  it("does not warn when the repeated venue belongs to the pick being replaced", () => {
    const build = buildWith({
      "fam-03": { venue: "Example Hall" },
      "fam-06": { venue: "Example Hall" },
    });
    const draft = createInitialDraft(build);
    const incoming = draft.alternatives.families[0].candidate;

    expect(
      assessReplacement(build, draft.selections, "families", 2, incoming).status,
    ).toBe("clean");
  });

  it("never treats two blank venues as the same place", () => {
    const build = buildWith({
      "fam-03": { venue: "" },
      "fam-06": { venue: "  " },
    });
    const draft = createInitialDraft(build);
    const incoming = draft.alternatives.families[0].candidate;

    expect(
      assessReplacement(build, draft.selections, "families", 0, incoming).status,
    ).toBe("clean");
  });

  it("does not throw on a saved draft whose events lack a venue or series", () => {
    const draft = createInitialDraft(mockIssueBuild);
    const incoming = structuredClone(draft.alternatives.families[0].candidate);
    const bare = incoming as unknown as Record<string, unknown>;
    delete bare.venue;
    delete bare.seriesId;
    delete (draft.selections.families[1] as unknown as Record<string, unknown>).seriesId;

    expect(
      assessReplacement(mockIssueBuild, draft.selections, "families", 0, incoming),
    ).toEqual({ status: "clean", reason: "Fits this slot." });
  });

  it("warns on a series already in the section", () => {
    const build = buildWith({
      "fam-02": { seriesId: "series-shared" },
      "fam-06": { seriesId: "series-shared" },
    });
    const draft = createInitialDraft(build);
    const incoming = draft.alternatives.families[0].candidate;
    const assessment = assessReplacement(
      build,
      draft.selections,
      "families",
      0,
      incoming,
    );

    expect(assessment.status).toBe("override");
    expect(assessment.reason).toBe(
      `Same series as pick 2: ${draft.selections.families[1].title}.`,
    );
  });

  it("warns when the event is already picked in another section", () => {
    const build = structuredClone(mockIssueBuild);
    const shared = build.sections[1].selected[0];
    build.sections[0].alternatives[0].candidate = structuredClone(shared);
    const draft = createInitialDraft(build);

    expect(
      assessReplacement(build, draft.selections, "families", 0, shared),
    ).toEqual({ status: "override", reason: "Already picked in Couples." });
  });

  it("sees a conflict created by an earlier swap in the same section", () => {
    // fam-06 and fam-07 share a venue. Neither conflicts with the original five.
    const build = buildWith({
      "fam-06": { venue: "Community Centre" },
      "fam-07": { venue: "Community Centre" },
    });
    const initial = createInitialDraft(build);
    const second = initial.alternatives.families[1].candidate;

    expect(
      assessReplacement(build, initial.selections, "families", 3, second).status,
    ).toBe("clean");

    const afterFirst = applyDraftCommand(build, initial, {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 1,
      alternativeCandidateId: "fam-06",
    });

    expect(afterFirst.event.payload.assessment).toEqual({
      status: "clean",
      reason: "Fits this slot.",
    });
    expect(
      assessReplacement(build, afterFirst.draft.selections, "families", 3, second),
    ).toEqual({
      status: "override",
      reason: "Same venue as pick 2: Community Centre.",
    });
  });

  it("lets the editor go ahead with a warned replacement and records the warning", () => {
    const build = buildWith({
      "fam-03": { venue: "Example Hall" },
      "fam-06": { venue: "Example Hall" },
    });
    const result = applyDraftCommand(build, createInitialDraft(build), {
      ...eventBase(),
      type: "replace",
      sectionId: "families",
      slotIndex: 0,
      alternativeCandidateId: "fam-06",
    });

    expect(result.draft.selections.families[0].id).toBe("fam-06");
    expect(result.event.payload.assessment).toEqual({
      status: "override",
      reason: "Same venue as pick 3: Example Hall.",
    });
  });
});
