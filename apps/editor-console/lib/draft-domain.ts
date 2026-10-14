import type {
  AlternativeCandidate,
  CommandResult,
  DraftCommand,
  DraftSnapshot,
  EditorWorkspace,
  InteractionEvent,
  IssueBuild,
  OrderingProvenance,
  ReplacementAssessment,
  SubmittedReplacement,
  SubmissionSnapshot,
  TrainingPair,
} from "@/lib/contracts";
import { isSelfFilled, sectionIds, slotKey } from "@/lib/contracts";
import { assessReplacement } from "@/lib/replacement-rules";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export function createInitialDraft(
  build: IssueBuild,
  options:
    | string
    | {
        draftId?: string;
        issueRevision?: number;
        editorIdentity?: string;
        reopenedFromSubmissionId?: string;
      } = {},
): DraftSnapshot {
  const normalizedOptions =
    typeof options === "string" ? { draftId: options } : options;

  return {
    id: normalizedOptions.draftId ?? crypto.randomUUID(),
    issueBuildId: build.id,
    issueRevision: normalizedOptions.issueRevision ?? 1,
    editorIdentity: normalizedOptions.editorIdentity ?? "demo-editor",
    reopenedFromSubmissionId: normalizedOptions.reopenedFromSubmissionId,
    revision: 0,
    status: "draft",
    selections: Object.fromEntries(
      build.sections.map((section) => [section.id, copy(section.selected)]),
    ) as DraftSnapshot["selections"],
    alternatives: Object.fromEntries(
      build.sections.map((section) => [section.id, copy(section.alternatives)]),
    ) as DraftSnapshot["alternatives"],
    selfFilledSlots: [],
    feedbackBySlot: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

function displayedAlternativeIds(alternatives: AlternativeCandidate[]) {
  return alternatives.map(({ candidate: item }) => item.id);
}

function displayedAlternatives(alternatives: AlternativeCandidate[]) {
  return alternatives.map(({ candidate: item, orderingPosition }) => ({
    candidateId: item.id,
    orderingPosition,
  }));
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
    if (isSelfFilled(draft.selfFilledSlots, command.sectionId, command.slotIndex)) {
      throw new Error(
        "You are filling this slot yourself. Unmark it before choosing a replacement.",
      );
    }

    const alternative = alternatives[alternativeIndex];
    // Assessed against the lineup as it stands now. A replacement is never refused:
    // the worst verdict is a warning, recorded with the event below.
    const assessment = assessReplacement(
      build,
      draft.selections,
      command.sectionId,
      command.slotIndex,
      alternative.candidate,
      draft.selfFilledSlots,
    );

    draft.history.push({
      sectionId: command.sectionId,
      slotIndex: command.slotIndex,
      previousSelections: copy(selections),
      previousAlternatives: copy(alternatives),
      hadPreviousSlotFeedback:
        slotKey(command.sectionId, command.slotIndex) in draft.feedbackBySlot,
      previousSlotFeedback:
        draft.feedbackBySlot[slotKey(command.sectionId, command.slotIndex)],
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
      displayedAlternatives: displayedAlternatives(
        currentDraft.alternatives[command.sectionId],
      ),
      selectedSlotPosition: command.slotIndex + 1,
      replacementOrderingPosition: alternative.orderingPosition,
      ordering: build.ordering,
      selectedClassification: selected.classification,
      replacementClassification: alternative.candidate.classification,
      sourceLinkConsumptionCaptured: true,
      provenanceVersion: "r8.interaction.v2",
    });
  } else if (command.type === "undo") {
    const previous = draft.history.pop();
    if (!previous) {
      throw new Error("There is no replacement to undo.");
    }

    draft.selections[previous.sectionId] = previous.previousSelections;
    draft.alternatives[previous.sectionId] = previous.previousAlternatives;
    const previousSlotKey = slotKey(previous.sectionId, previous.slotIndex);
    const legacyPreviousFeedback = previous.previousFeedback?.[previousSlotKey];
    const hadPreviousSlotFeedback =
      previous.hadPreviousSlotFeedback ?? legacyPreviousFeedback !== undefined;
    const previousSlotFeedback =
      previous.previousSlotFeedback ?? legacyPreviousFeedback;
    if (hadPreviousSlotFeedback && previousSlotFeedback) {
      draft.feedbackBySlot[previousSlotKey] = previousSlotFeedback;
    } else {
      delete draft.feedbackBySlot[previousSlotKey];
    }

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
  } else if (command.type === "self_fill") {
    const selected = draft.selections[command.sectionId]?.[command.slotIndex];
    if (!selected) {
      throw new Error("That slot is no longer available.");
    }

    // The pick stays in the slot underneath, so unmarking brings it back.
    const others = (draft.selfFilledSlots ?? []).filter(
      (slot) =>
        !(slot.sectionId === command.sectionId && slot.slotIndex === command.slotIndex),
    );
    draft.selfFilledSlots = command.selfFilled
      ? [...others, { sectionId: command.sectionId, slotIndex: command.slotIndex }]
      : others;
    event = baseEvent(nextRevision, command, {
      sectionId: command.sectionId,
      slotIndex: command.slotIndex,
      selfFilled: command.selfFilled,
      candidateId: selected.id,
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

function isOrderingProvenance(value: unknown): value is OrderingProvenance {
  if (!value || typeof value !== "object") return false;
  const ordering = value as Record<string, unknown>;
  return [
    "adapterVersion",
    "rankerVersion",
    "evidenceVersion",
    "generatedAt",
    "inputHash",
  ].every((key) => typeof ordering[key] === "string" && ordering[key] !== "");
}

function eventMatchesSlot(
  event: InteractionEvent,
  sectionId: string,
  slotIndex: number,
) {
  return (
    event.payload.sectionId === sectionId && event.payload.slotIndex === slotIndex
  );
}

function sourceWasOpened(events: InteractionEvent[], candidateId: string) {
  return events.some(
    (event) =>
      event.type === "source_open" && event.payload.candidateId === candidateId,
  );
}

function parseDisplayedAlternatives(value: unknown) {
  if (!Array.isArray(value)) return null;

  const parsed = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.candidateId !== "string" ||
      typeof candidate.orderingPosition !== "number" ||
      !Number.isInteger(candidate.orderingPosition) ||
      candidate.orderingPosition < 1
    ) {
      return null;
    }
    return {
      candidateId: candidate.candidateId,
      orderingPosition: candidate.orderingPosition,
    };
  });

  return parsed.every((item) => item !== null)
    ? (parsed as Array<{ candidateId: string; orderingPosition: number }>)
    : null;
}

function parseAssessment(value: unknown): ReplacementAssessment | null {
  if (!value || typeof value !== "object") return null;
  const { status, reason } = value as Record<string, unknown>;
  if (status !== "clean" && status !== "override" && status !== "unavailable") {
    return null;
  }
  return typeof reason === "string" ? { status, reason } : null;
}

function latestMatchingEvent(
  events: InteractionEvent[],
  predicate: (event: InteractionEvent) => boolean,
) {
  return [...events]
    .sort((left, right) => right.draftRevision - left.draftRevision)
    .find(predicate);
}

function deriveSubmittedReplacement(
  workspace: EditorWorkspace,
  sectionId: (typeof sectionIds)[number],
  slotIndex: number,
): { replacement: SubmittedReplacement; explicitlyPreferred: boolean } | null {
  const section = workspace.build.sections.find((item) => item.id === sectionId);
  const original = section?.selected[slotIndex];
  const selected = workspace.draft.selections[sectionId]?.[slotIndex];
  if (!section || !original || !selected || original.id === selected.id) return null;

  const recordedReason =
    workspace.draft.feedbackBySlot[slotKey(sectionId, slotIndex)] ??
    "unclassified";
  const currentReplaceEvent = latestMatchingEvent(
    workspace.events,
    (event) =>
      event.type === "replace" &&
      eventMatchesSlot(event, sectionId, slotIndex) &&
      event.payload.replacementCandidateId === selected.id,
  );
  const inheritedReplacement = workspace.baseSubmission?.replacements?.find(
    (replacement) =>
      replacement.sectionId === sectionId &&
      replacement.slotIndex === slotIndex &&
      replacement.originalCandidateId === original.id &&
      replacement.finalCandidateId === selected.id,
  );
  const feedbackEvent = latestMatchingEvent(
    workspace.events,
    (event) =>
      event.type === "feedback" &&
      eventMatchesSlot(event, sectionId, slotIndex) &&
      event.payload.candidateId === selected.id,
  );
  // The verdict's one home is the replace event: what the editor was shown when he made
  // this swap (Decision_Log §108). The bundle's build-time table is not consulted.
  const assessment = currentReplaceEvent
    ? parseAssessment(currentReplaceEvent.payload.assessment)
    : (inheritedReplacement?.assessment ?? null);
  const feasible =
    assessment !== null &&
    (assessment.status === "clean" || assessment.status === "override");
  const finalAlternativePosition =
    section.alternatives.find(
      (alternative) => alternative.candidate.id === selected.id,
    )?.orderingPosition ?? null;
  const currentDisplayedAlternatives = parseDisplayedAlternatives(
    currentReplaceEvent?.payload.displayedAlternatives,
  );
  const displayedAlternativeProvenance =
    currentDisplayedAlternatives ??
    inheritedReplacement?.provenance.displayedAlternatives ??
    [];
  const eventOrdering = currentReplaceEvent?.payload.ordering;
  const ordering = isOrderingProvenance(eventOrdering)
    ? eventOrdering
    : inheritedReplacement?.provenance.ordering ?? null;
  const originalSourceOpened =
    sourceWasOpened(workspace.events, original.id) ||
    inheritedReplacement?.provenance.originalSourceOpened === true;
  const finalSourceOpened =
    sourceWasOpened(workspace.events, selected.id) ||
    inheritedReplacement?.provenance.finalSourceOpened === true;

  const currentEventHasCompleteProvenance = Boolean(
    currentReplaceEvent &&
      !currentReplaceEvent.incomplete &&
      currentReplaceEvent.payload.provenanceVersion === "r8.interaction.v2" &&
      currentReplaceEvent.payload.sourceLinkConsumptionCaptured === true &&
      currentDisplayedAlternatives?.some(
        (alternative) => alternative.candidateId === selected.id,
      ) &&
      isOrderingProvenance(eventOrdering) &&
      currentReplaceEvent.payload.selectedSlotPosition === slotIndex + 1 &&
      currentReplaceEvent.payload.replacementOrderingPosition ===
        finalAlternativePosition &&
      finalAlternativePosition !== null,
  );
  const inheritedHasCompleteProvenance = Boolean(
    !currentReplaceEvent && inheritedReplacement?.provenanceComplete,
  );
  const provenanceComplete = Boolean(
    (currentEventHasCompleteProvenance || inheritedHasCompleteProvenance) &&
      assessment &&
      assessment.reason &&
      original.classification === "classified" &&
      selected.classification === "classified" &&
      workspace.build.id &&
      workspace.build.issueKey &&
      workspace.build.bundleHash &&
      workspace.build.contractVersion,
  );
  const currentPreferenceRecorded = Boolean(
    feedbackEvent?.payload.value === "preferred" &&
      (!currentReplaceEvent ||
        feedbackEvent.draftRevision > currentReplaceEvent.draftRevision),
  );
  const inheritedPreferenceRecorded = Boolean(
    !feedbackEvent && inheritedReplacement?.recordedReason === "preferred",
  );
  const explicitlyPreferred =
    recordedReason === "preferred" &&
    (currentPreferenceRecorded || inheritedPreferenceRecorded);

  return {
    replacement: {
      sectionId,
      slotIndex,
      originalCandidateId: original.id,
      finalCandidateId: selected.id,
      recordedReason,
      assessment,
      feasible,
      provenanceComplete,
      provenance: {
        displayedAlternatives: displayedAlternativeProvenance,
        ordering,
        originalSelectionPosition: slotIndex + 1,
        finalAlternativePosition,
        originalSourceOpened,
        finalSourceOpened,
      },
    },
    explicitlyPreferred,
  };
}

export function createReopenedDraft(
  workspace: EditorWorkspace,
  options: {
    draftId?: string;
    editorIdentity: string;
    reopenedAt: string;
  },
): DraftSnapshot {
  if (workspace.draft.status !== "submitted" || !workspace.submission) {
    throw new Error("Only a submitted revision can be reopened.");
  }

  return {
    ...copy(workspace.draft),
    id: options.draftId ?? crypto.randomUUID(),
    issueRevision: workspace.submission.revision + 1,
    editorIdentity: options.editorIdentity,
    reopenedFromSubmissionId: workspace.submission.submissionId,
    revision: 0,
    status: "draft",
    history: [],
    updatedAt: options.reopenedAt,
  };
}

export function createSubmission(
  workspace: EditorWorkspace,
  options: {
    submissionId?: string;
    submitClientEventId: string;
    editorIdentity: string;
    submittedAt?: string;
  },
): SubmissionSnapshot {
  const trainingPairs: TrainingPair[] = [];
  const replacements: SubmittedReplacement[] = [];

  const selfFilledSlots = sectionIds.flatMap((sectionId) =>
    workspace.draft.selections[sectionId]
      .map((_, slotIndex) => ({ sectionId, slotIndex }))
      .filter((slot) =>
        isSelfFilled(workspace.draft.selfFilledSlots, slot.sectionId, slot.slotIndex),
      ),
  );

  for (const sectionId of sectionIds) {
    workspace.draft.selections[sectionId].forEach((selected, slotIndex) => {
      // His own event goes in this slot, so a swap made here before he marked it says
      // nothing about the final lineup: no replacement and no pair.
      if (isSelfFilled(selfFilledSlots, sectionId, slotIndex)) return;
      const derived = deriveSubmittedReplacement(workspace, sectionId, slotIndex);
      if (!derived) return;

      replacements.push(derived.replacement);
      if (
        derived.explicitlyPreferred &&
        derived.replacement.feasible &&
        derived.replacement.provenanceComplete
      ) {
        trainingPairs.push({
          sectionId,
          slotIndex,
          rejectedCandidateId: derived.replacement.originalCandidateId,
          preferredCandidateId: selected.id,
          feedback: "preferred",
        });
      }
    });
  }

  return {
    submissionId: options.submissionId ?? crypto.randomUUID(),
    submitClientEventId: options.submitClientEventId,
    issueKey: workspace.build.issueKey,
    issueDate: workspace.build.issueDate,
    issueBuildId: workspace.build.id,
    buildVersion: workspace.build.buildVersion,
    contractVersion: workspace.build.contractVersion,
    bundleHash: workspace.build.bundleHash,
    editorIdentity: options.editorIdentity,
    revision: workspace.draft.issueRevision,
    draftId: workspace.draft.id,
    draftRevision: workspace.draft.revision + 1,
    submittedAt: options.submittedAt ?? new Date().toISOString(),
    finalSelections: copy(workspace.draft.selections),
    selfFilledSlots,
    replacements,
    trainingPairs,
    incompleteEventCount: workspace.events.filter((event) => event.incomplete).length,
  };
}
