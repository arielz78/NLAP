import type {
  AlternativeCandidate,
  CommandResult,
  DraftCommand,
  DraftSnapshot,
  EditorWorkspace,
  InteractionEvent,
  IssueBuild,
  SubmissionSnapshot,
  TrainingPair,
} from "@/lib/contracts";
import { sectionIds, slotKey } from "@/lib/contracts";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export function createInitialDraft(
  build: IssueBuild,
  draftId = crypto.randomUUID(),
): DraftSnapshot {
  return {
    id: draftId,
    issueBuildId: build.id,
    revision: 0,
    status: "draft",
    selections: Object.fromEntries(
      build.sections.map((section) => [section.id, copy(section.selected)]),
    ) as DraftSnapshot["selections"],
    alternatives: Object.fromEntries(
      build.sections.map((section) => [section.id, copy(section.alternatives)]),
    ) as DraftSnapshot["alternatives"],
    feedbackBySlot: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

function displayedAlternativeIds(alternatives: AlternativeCandidate[]) {
  return alternatives.map(({ candidate: item }) => item.id);
}

function baseEvent(
  draftRevision: number,
  command: DraftCommand,
  payload: Record<string, unknown>,
  incomplete = false,
): InteractionEvent {
  return {
    clientEventId: command.clientEventId,
    type: command.type,
    draftRevision,
    occurredAt: command.occurredAt,
    incomplete,
    payload,
  };
}

export function applyDraftCommand(
  build: IssueBuild,
  currentDraft: DraftSnapshot,
  command: DraftCommand,
): CommandResult {
  if (currentDraft.status !== "draft") {
    throw new Error("This issue has already been submitted.");
  }

  const draft = copy(currentDraft);
  const nextRevision = currentDraft.revision + 1;
  let event: InteractionEvent;

  if (command.type === "replace") {
    const section = build.sections.find((item) => item.id === command.sectionId);
    const selections = draft.selections[command.sectionId];
    const alternatives = draft.alternatives[command.sectionId];
    const selected = selections[command.slotIndex];
    const alternativeIndex = alternatives.findIndex(
      ({ candidate: item }) => item.id === command.alternativeCandidateId,
    );

    if (!section || !selected || alternativeIndex === -1) {
      throw new Error("That replacement is no longer available.");
    }

    const alternative = alternatives[alternativeIndex];
    const assessment =
      section.replacementAssessments[selected.id]?.[alternative.candidate.id];

    if (!assessment || assessment.status === "unavailable") {
      throw new Error(
        assessment?.reason ?? "The assembly bundle did not assess this replacement.",
      );
    }

    draft.history.push({
      sectionId: command.sectionId,
      slotIndex: command.slotIndex,
      previousSelections: copy(selections),
      previousAlternatives: copy(alternatives),
      previousFeedback: copy(draft.feedbackBySlot),
      summary: `${selected.title} → ${alternative.candidate.title}`,
    });

    selections[command.slotIndex] = alternative.candidate;
    alternatives[alternativeIndex] = {
      candidate: selected,
      orderingPosition: alternative.orderingPosition,
    };
    delete draft.feedbackBySlot[slotKey(command.sectionId, command.slotIndex)];

    event = baseEvent(nextRevision, command, {
      sectionId: command.sectionId,
      slotIndex: command.slotIndex,
      rejectedCandidateId: selected.id,
      replacementCandidateId: alternative.candidate.id,
      assessment,
      displayedAlternativeIds: displayedAlternativeIds(
        currentDraft.alternatives[command.sectionId],
      ),
      ordering: build.ordering,
      selectedClassification: selected.classification,
      replacementClassification: alternative.candidate.classification,
    });
  } else if (command.type === "undo") {
    const previous = draft.history.pop();
    if (!previous) {
      throw new Error("There is no replacement to undo.");
    }

    draft.selections[previous.sectionId] = previous.previousSelections;
    draft.alternatives[previous.sectionId] = previous.previousAlternatives;
    draft.feedbackBySlot = previous.previousFeedback;

    event = baseEvent(nextRevision, command, {
      sectionId: previous.sectionId,
      slotIndex: previous.slotIndex,
      undoneChange: previous.summary,
      ordering: build.ordering,
    });
  } else if (command.type === "feedback") {
    const selected = draft.selections[command.sectionId]?.[command.slotIndex];
    if (!selected) {
      throw new Error("That selection is no longer available.");
    }

    draft.feedbackBySlot[slotKey(command.sectionId, command.slotIndex)] =
      command.value;
    event = baseEvent(nextRevision, command, {
      sectionId: command.sectionId,
      slotIndex: command.slotIndex,
      candidateId: selected.id,
      value: command.value,
    });
  } else {
    const matchingCandidate = build.sections
      .flatMap((section) => [
        ...section.selected,
        ...section.alternatives.map(({ candidate: item }) => item),
      ])
      .find((item) => item.id === command.candidateId);

    event = baseEvent(
      nextRevision,
      command,
      {
        candidateId: command.candidateId,
        sourceUrl: command.sourceUrl,
        context: command.context,
        ordering: build.ordering,
      },
      !matchingCandidate,
    );
  }

  draft.revision = nextRevision;
  draft.updatedAt = command.occurredAt;
  return { draft, event };
}

export function createSubmission(
  workspace: EditorWorkspace,
  submissionId = crypto.randomUUID(),
  submittedAt = new Date().toISOString(),
): SubmissionSnapshot {
  const trainingPairs: TrainingPair[] = [];

  for (const sectionId of sectionIds) {
    const originalSection = workspace.build.sections.find(
      (section) => section.id === sectionId,
    );
    if (!originalSection) continue;

    workspace.draft.selections[sectionId].forEach((selected, slotIndex) => {
      const original = originalSection.selected[slotIndex];
      const feedback = workspace.draft.feedbackBySlot[slotKey(sectionId, slotIndex)];

      if (
        original &&
        selected.id !== original.id &&
        feedback === "preferred" &&
        original.classification === "classified" &&
        selected.classification === "classified"
      ) {
        trainingPairs.push({
          sectionId,
          slotIndex,
          rejectedCandidateId: original.id,
          preferredCandidateId: selected.id,
          feedback: "preferred",
        });
      }
    });
  }

  return {
    submissionId,
    issueBuildId: workspace.build.id,
    draftId: workspace.draft.id,
    draftRevision: workspace.draft.revision + 1,
    submittedAt,
    finalSelections: copy(workspace.draft.selections),
    trainingPairs,
    incompleteEventCount: workspace.events.filter((event) => event.incomplete).length,
  };
}
