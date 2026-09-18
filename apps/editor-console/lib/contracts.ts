export const sectionIds = ["families", "couples", "golden-age"] as const;

export type SectionId = (typeof sectionIds)[number];
export type ReplacementStatus = "clean" | "override" | "unavailable";
export type FeedbackValue = "preferred" | "broken" | "skipped";
export type DraftStatus = "draft" | "submitted";
export type PersistenceMode = "postgres" | "browser-demo";

export interface Candidate {
  id: string;
  seriesId: string;
  occurrenceId: string;
  title: string;
  startsAt: string;
  venue: string;
  city: string;
  description: string;
  sourceLabel: string;
  sourceUrl: string;
  classification: "classified" | "unclassified";
}

export interface ReplacementAssessment {
  status: ReplacementStatus;
  reason: string;
}

export interface AlternativeCandidate {
  candidate: Candidate;
  orderingPosition: number;
}

export interface SectionBundle {
  id: SectionId;
  label: string;
  selected: Candidate[];
  alternatives: AlternativeCandidate[];
  replacementAssessments: Record<
    string,
    Record<string, ReplacementAssessment>
  >;
}

export interface OrderingProvenance {
  adapterVersion: string;
  rankerVersion: string;
  evidenceVersion: string;
  generatedAt: string;
  inputHash: string;
}

export interface IssueBuild {
  id: string;
  issueKey: string;
  issueDate: string;
  buildVersion: number;
  contractVersion: string;
  bundleHash: string;
  ordering: OrderingProvenance;
  sections: SectionBundle[];
}

export interface DraftHistoryEntry {
  sectionId: SectionId;
  slotIndex: number;
  previousSelections: Candidate[];
  previousAlternatives: AlternativeCandidate[];
  previousFeedback: Record<string, FeedbackValue>;
  summary: string;
}

export interface DraftSnapshot {
  id: string;
  issueBuildId: string;
  revision: number;
  status: DraftStatus;
  selections: Record<SectionId, Candidate[]>;
  alternatives: Record<SectionId, AlternativeCandidate[]>;
  feedbackBySlot: Record<string, FeedbackValue>;
  history: DraftHistoryEntry[];
  updatedAt: string;
}

export type InteractionEventType =
  | "replace"
  | "undo"
  | "feedback"
  | "source_open"
  | "submit";

export interface InteractionEvent {
  clientEventId: string;
  type: InteractionEventType;
  draftRevision: number;
  occurredAt: string;
  incomplete: boolean;
  payload: Record<string, unknown>;
}

export interface TrainingPair {
  sectionId: SectionId;
  slotIndex: number;
  rejectedCandidateId: string;
  preferredCandidateId: string;
  feedback: "preferred";
}

export interface SubmissionSnapshot {
  submissionId: string;
  issueBuildId: string;
  draftId: string;
  draftRevision: number;
  submittedAt: string;
  finalSelections: Record<SectionId, Candidate[]>;
  trainingPairs: TrainingPair[];
  incompleteEventCount: number;
}

export interface EditorWorkspace {
  build: IssueBuild;
  draft: DraftSnapshot;
  events: InteractionEvent[];
  persistence: PersistenceMode;
  notice?: string;
  submission?: SubmissionSnapshot;
}

interface CommandBase {
  clientEventId: string;
  occurredAt: string;
}

export type DraftCommand =
  | (CommandBase & {
      type: "replace";
      sectionId: SectionId;
      slotIndex: number;
      alternativeCandidateId: string;
    })
  | (CommandBase & { type: "undo" })
  | (CommandBase & {
      type: "feedback";
      sectionId: SectionId;
      slotIndex: number;
      value: FeedbackValue;
    })
  | (CommandBase & {
      type: "source_open";
      candidateId: string;
      sourceUrl: string;
      context: "selected" | "alternative";
    });

export interface CommandResult {
  draft: DraftSnapshot;
  event: InteractionEvent;
}

export function slotKey(sectionId: SectionId, slotIndex: number) {
  return `${sectionId}:${slotIndex}`;
}
