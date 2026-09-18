"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  Candidate,
  DraftCommand,
  EditorWorkspace,
  FeedbackValue,
  InteractionEvent,
  ReplacementAssessment,
  SectionId,
  SubmissionSnapshot,
} from "@/lib/contracts";
import { sectionIds, slotKey } from "@/lib/contracts";
import {
  applyDraftCommand,
  createSubmission,
} from "@/lib/draft-domain";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/Toronto",
});

const timeFormatter = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

const issueDateFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

type SaveState = "saved" | "saving" | "error";

interface ActiveSlot {
  sectionId: SectionId;
  slotIndex: number;
}

function commandBase() {
  return {
    clientEventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  };
}

function formatSchedule(startsAt: string) {
  const date = new Date(startsAt);
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

function Icon({ name }: { name: "arrow" | "check" | "clock" | "link" | "undo" }) {
  if (name === "check") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m4 10.3 3.6 3.6L16 5.8" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l2.7 1.7" />
      </svg>
    );
  }
  if (name === "link") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M8.2 11.8 11.8 8M6.5 13.5l-1 1a3 3 0 0 1-4.2-4.2l3-3a3 3 0 0 1 4.2 0M13.5 6.5l1-1a3 3 0 0 0-4.2-4.2l-3 3a3 3 0 0 0 0 4.2" />
      </svg>
    );
  }
  if (name === "undo") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M7 5 3 9l4 4M4 9h7a5 5 0 0 1 5 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h12M12 6l4 4-4 4" />
    </svg>
  );
}

function SourceLink({
  candidate,
  context,
  onOpen,
}: {
  candidate: Candidate;
  context: "selected" | "alternative";
  onOpen: (candidate: Candidate, context: "selected" | "alternative") => void;
}) {
  return (
    <a
      className="source-link"
      href={candidate.sourceUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() => onOpen(candidate, context)}
    >
      <Icon name="link" />
      {candidate.sourceLabel}
    </a>
  );
}

function FeedbackPrompt({
  value,
  disabled,
  onChoose,
}: {
  value?: FeedbackValue;
  disabled: boolean;
  onChoose: (value: FeedbackValue) => void;
}) {
  return (
    <div className="feedback-prompt">
      <span>Why did you replace the original event?</span>
      <div className="feedback-actions" aria-label="Replacement feedback">
        {(
          [
            ["preferred", "I prefer this event"],
            ["broken", "Original listing is broken"],
            ["skipped", "Skip"],
          ] as const
        ).map(([option, label]) => (
          <button
            type="button"
            key={option}
            className={value === option ? "selected" : ""}
            disabled={disabled}
            onClick={() => onChoose(option)}
          >
            {value === option && <Icon name="check" />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedCard({
  candidate,
  position,
  active,
  changed,
  feedback,
  disabled,
  onSelect,
  onFeedback,
  onSourceOpen,
}: {
  candidate: Candidate;
  position: number;
  active: boolean;
  changed: boolean;
  feedback?: FeedbackValue;
  disabled: boolean;
  onSelect: () => void;
  onFeedback: (value: FeedbackValue) => void;
  onSourceOpen: (
    candidate: Candidate,
    context: "selected" | "alternative",
  ) => void;
}) {
  return (
    <article
      className={`selected-card ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}
    >
      <button
        type="button"
        className="card-select-target"
        onClick={onSelect}
        disabled={disabled}
        aria-label={`Choose a replacement for ${candidate.title}`}
      />
      <div className="position-number">{String(position).padStart(2, "0")}</div>
      <div className="selected-card-body">
        <div className="card-kicker">
          <span>{formatSchedule(candidate.startsAt)}</span>
          {changed && <span className="changed-chip">Changed</span>}
        </div>
        <h3>{candidate.title}</h3>
        <p className="venue-line">
          {candidate.venue} <span>·</span> {candidate.city}
        </p>
        <p className="description">{candidate.description}</p>
        <SourceLink
          candidate={candidate}
          context="selected"
          onOpen={onSourceOpen}
        />
        {changed && (
          <FeedbackPrompt
            value={feedback}
            disabled={disabled}
            onChoose={onFeedback}
          />
        )}
      </div>
      <span className="replace-cue" aria-hidden="true">
        Replace <Icon name="arrow" />
      </span>
    </article>
  );
}

function AssessmentBadge({ assessment }: { assessment: ReplacementAssessment }) {
  const label =
    assessment.status === "clean"
      ? "Clean swap"
      : assessment.status === "override"
        ? "Needs override"
        : "Unavailable";
  return <span className={`assessment ${assessment.status}`}>{label}</span>;
}

function AlternativeCard({
  candidate,
  assessment,
  disabled,
  onReplace,
  onSourceOpen,
}: {
  candidate: Candidate;
  assessment: ReplacementAssessment;
  disabled: boolean;
  onReplace: () => void;
  onSourceOpen: (
    candidate: Candidate,
    context: "selected" | "alternative",
  ) => void;
}) {
  const unavailable = assessment.status === "unavailable";
  return (
    <article className={`alternative-card ${unavailable ? "unavailable" : ""}`}>
      <div className="alternative-heading">
        <AssessmentBadge assessment={assessment} />
        <span>{formatSchedule(candidate.startsAt)}</span>
      </div>
      <h3>{candidate.title}</h3>
      <p className="venue-line">
        {candidate.venue} <span>·</span> {candidate.city}
      </p>
      <p className="description">{candidate.description}</p>
      <p className="assessment-reason">{assessment.reason}</p>
      <div className="alternative-actions">
        <SourceLink
          candidate={candidate}
          context="alternative"
          onOpen={onSourceOpen}
        />
        <button
          type="button"
          className="replace-button"
          disabled={disabled || unavailable}
          onClick={onReplace}
        >
          {assessment.status === "override" ? "Replace anyway" : "Replace"}
        </button>
      </div>
    </article>
  );
}

export function EditorConsole({
  initialWorkspace,
}: {
  initialWorkspace: EditorWorkspace;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeSection, setActiveSection] = useState<SectionId>("families");
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>({
    sectionId: "families",
    slotIndex: 0,
  });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = `r8-editor:${workspace.build.id}`;
  const currentSectionBundle = workspace.build.sections.find(
    (section) => section.id === activeSection,
  )!;
  const currentSelections = workspace.draft.selections[activeSection];
  const currentAlternatives = workspace.draft.alternatives[activeSection];
  const selectedForReplacement =
    activeSlot.sectionId === activeSection
      ? currentSelections[activeSlot.slotIndex]
      : currentSelections[0];
  const submitted = workspace.draft.status === "submitted";
  const isDemo = workspace.persistence === "browser-demo";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (initialWorkspace.persistence === "browser-demo") {
        const saved = window.localStorage.getItem(
          `r8-editor:${initialWorkspace.build.id}`,
        );
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as EditorWorkspace;
            if (
              parsed.build.id === initialWorkspace.build.id &&
              parsed.build.buildVersion === initialWorkspace.build.buildVersion
            ) {
              setWorkspace({
                ...parsed,
                notice: initialWorkspace.notice,
                persistence: "browser-demo",
              });
            }
          } catch {
            window.localStorage.removeItem(
              `r8-editor:${initialWorkspace.build.id}`,
            );
          }
        }
      }
      setHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialWorkspace]);

  useEffect(() => {
    if (hydrated && workspace.persistence === "browser-demo") {
      window.localStorage.setItem(storageKey, JSON.stringify(workspace));
    }
  }, [hydrated, storageKey, workspace]);

  const changedCount = useMemo(
    () =>
      sectionIds.reduce((count, sectionId) => {
        const original = workspace.build.sections.find(
          (section) => section.id === sectionId,
        )!.selected;
        return (
          count +
          workspace.draft.selections[sectionId].filter(
            (candidate, index) => candidate.id !== original[index]?.id,
          ).length
        );
      }, 0),
    [workspace.build.sections, workspace.draft.selections],
  );

  async function dispatchCommand(command: DraftCommand) {
    setError(null);
    setSaveState("saving");

    try {
      if (workspace.persistence === "browser-demo") {
        const result = applyDraftCommand(workspace.build, workspace.draft, command);
        setWorkspace((current) => ({
          ...current,
          draft: result.draft,
          events: [...current.events, result.event],
        }));
      } else {
        const response = await fetch(
          `/api/drafts/${workspace.draft.id}/commands`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: workspace.draft.revision,
              command,
            }),
          },
        );
        const body = (await response.json()) as
          | { draft: EditorWorkspace["draft"]; event: InteractionEvent }
          | { error: string };
        if (!response.ok || !("draft" in body)) {
          throw new Error("error" in body ? body.error : "The draft could not be saved.");
        }
        setWorkspace((current) => ({
          ...current,
          draft: body.draft,
          events: current.events.some(
            (event) => event.clientEventId === body.event.clientEventId,
          )
            ? current.events
            : [...current.events, body.event],
        }));
      }
      setSaveState("saved");
    } catch (caught) {
      setSaveState("error");
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
    }
  }

  function selectSection(sectionId: SectionId) {
    setActiveSection(sectionId);
    setActiveSlot({ sectionId, slotIndex: 0 });
  }

  function openSource(
    candidate: Candidate,
    context: "selected" | "alternative",
  ) {
    void dispatchCommand({
      ...commandBase(),
      type: "source_open",
      candidateId: candidate.id,
      sourceUrl: candidate.sourceUrl,
      context,
    });
  }

  async function submitDraft() {
    setConfirmingSubmit(false);
    setError(null);
    setSaveState("saving");
    const occurredAt = new Date().toISOString();
    const clientEventId = crypto.randomUUID();

    try {
      if (workspace.persistence === "browser-demo") {
        const submission = createSubmission(workspace, crypto.randomUUID(), occurredAt);
        const draft = {
          ...workspace.draft,
          revision: workspace.draft.revision + 1,
          status: "submitted" as const,
          updatedAt: occurredAt,
        };
        const event: InteractionEvent = {
          clientEventId,
          type: "submit",
          draftRevision: draft.revision,
          occurredAt,
          incomplete: false,
          payload: {
            submissionId: submission.submissionId,
            trainingPairCount: submission.trainingPairs.length,
          },
        };
        setWorkspace((current) => ({
          ...current,
          draft,
          events: [...current.events, event],
          submission,
        }));
      } else {
        const response = await fetch(
          `/api/drafts/${workspace.draft.id}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedRevision: workspace.draft.revision,
              clientEventId,
              occurredAt,
            }),
          },
        );
        const body = (await response.json()) as
          | {
              draft: EditorWorkspace["draft"];
              event: InteractionEvent;
              submission: SubmissionSnapshot;
            }
          | { error: string };
        if (!response.ok || !("draft" in body)) {
          throw new Error("error" in body ? body.error : "The issue could not be submitted.");
        }
        setWorkspace((current) => ({
          ...current,
          draft: body.draft,
          events: [...current.events, body.event],
          submission: body.submission,
        }));
      }
      setSaveState("saved");
    } catch (caught) {
      setSaveState("error");
      setError(caught instanceof Error ? caught.message : "The issue could not be submitted.");
    }
  }

  return (
    <main className="console-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">VB</div>
          <div>
            <span className="brand-name">Vaughan Brief</span>
            <span className="brand-product">Editor console</span>
          </div>
        </div>
        <div className="issue-context">
          <span>Issue of</span>
          <strong>
            {issueDateFormatter.format(new Date(`${workspace.build.issueDate}T00:00:00Z`))}
          </strong>
          <span className="version-pill">Build {workspace.build.buildVersion}</span>
          {isDemo && <span className="demo-pill">Demo · browser only</span>}
        </div>
        <div className="topbar-actions">
          <div className={`save-state ${saveState}`} role="status">
            {saveState === "saving" ? <Icon name="clock" /> : <Icon name="check" />}
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Not saved"
                : isDemo
                  ? "Saved in this browser"
                  : "All changes saved"}
          </div>
          <button
            type="button"
            className="submit-button"
            disabled={submitted || saveState === "saving"}
            onClick={() => setConfirmingSubmit(true)}
          >
            {submitted
              ? isDemo
                ? "Demo completed"
                : "Issue submitted"
              : isDemo
                ? "Simulate submit"
                : "Submit issue"}
            {!submitted && <Icon name="arrow" />}
          </button>
        </div>
      </header>

      {isDemo ? (
        <div className="demo-mode-banner" role="status">
          <span className="demo-mode-label">Demo mode</span>
          <div>
            <strong>Browser-only practice workspace</strong>
            <span>
              Nothing on this screen is saved to PostgreSQL, submitted for
              reconciliation, or sent to Airtable.
            </span>
            {workspace.notice && <small>{workspace.notice}</small>}
          </div>
        </div>
      ) : (
        workspace.notice && <div className="fixture-notice">{workspace.notice}</div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload draft
          </button>
        </div>
      )}
      {submitted && workspace.submission && (
        <div
          className={`submitted-banner ${isDemo ? "demo-submitted" : ""}`}
          role="status"
        >
          <Icon name="check" />
          <div>
            <strong>
              {isDemo ? "Demo submission saved in this browser." : "Lineup submitted."}
            </strong>
            {isDemo ? (
              <span>
                No real submission or receipt was created. Refreshing will preserve
                this simulated state on this device.
              </span>
            ) : (
              <span>
                Receipt {workspace.submission.submissionId.slice(0, 8)} · {changedCount}{" "}
                {changedCount === 1 ? "change" : "changes"} in the final lineup
              </span>
            )}
          </div>
        </div>
      )}

      <section className="workspace-heading">
        <div>
          <p className="overline">Weekly lineup</p>
          <h1>Shape this week’s issue.</h1>
          <p className="heading-copy">
            Five picks per section. Choose a card, compare its alternatives, and
            replace only what needs a human eye.
          </p>
        </div>
        <div className="progress-summary" aria-label="Issue progress">
          <strong>15</strong>
          <span>events selected</span>
          <i />
          <strong>{changedCount}</strong>
          <span>changed</span>
        </div>
      </section>

      <nav className="section-tabs" aria-label="Issue sections">
        {workspace.build.sections.map((section) => {
          const changes = workspace.draft.selections[section.id].filter(
            (candidate, index) => candidate.id !== section.selected[index]?.id,
          ).length;
          return (
            <button
              type="button"
              key={section.id}
              className={activeSection === section.id ? "active" : ""}
              onClick={() => selectSection(section.id)}
            >
              <span>{section.label}</span>
              <small>{changes ? `${changes} changed` : "5 picks"}</small>
            </button>
          );
        })}
      </nav>

      <div className="editor-grid">
        <section className="lineup-column" aria-labelledby="lineup-title">
          <div className="column-heading">
            <div>
              <h2 id="lineup-title">{currentSectionBundle.label} lineup</h2>
            </div>
            {workspace.draft.history.length > 0 && !submitted && (
              <button
                type="button"
                className="undo-button"
                disabled={saveState === "saving"}
                onClick={() => void dispatchCommand({ ...commandBase(), type: "undo" })}
              >
                <Icon name="undo" />
                Undo last replacement
              </button>
            )}
          </div>
          <div className="selected-list">
            {currentSelections.map((candidate, index) => {
              const original = currentSectionBundle.selected[index];
              return (
                <SelectedCard
                  key={`${index}-${candidate.id}`}
                  candidate={candidate}
                  position={index + 1}
                  active={
                    activeSlot.sectionId === activeSection &&
                    activeSlot.slotIndex === index
                  }
                  changed={candidate.id !== original?.id}
                  feedback={
                    workspace.draft.feedbackBySlot[slotKey(activeSection, index)]
                  }
                  disabled={submitted || saveState === "saving"}
                  onSelect={() =>
                    setActiveSlot({ sectionId: activeSection, slotIndex: index })
                  }
                  onFeedback={(value) =>
                    void dispatchCommand({
                      ...commandBase(),
                      type: "feedback",
                      sectionId: activeSection,
                      slotIndex: index,
                      value,
                    })
                  }
                  onSourceOpen={openSource}
                />
              );
            })}
          </div>
        </section>

        <aside className="alternatives-column" aria-labelledby="alternatives-title">
          <div className="alternatives-sticky">
            <div className="column-heading alternatives-title-row">
              <div>
                <p className="overline">Replacement bench</p>
                <h2 id="alternatives-title">Alternatives</h2>
              </div>
              <span className="target-pill">Pick {activeSlot.slotIndex + 1}</span>
            </div>
            <p className="alternative-intro">
              Replacing <strong>{selectedForReplacement.title}</strong>. These are
              already ordered upstream for this section.
            </p>
            <div className="alternative-list">
              {currentAlternatives.map(({ candidate }) => {
                const assessment = currentSectionBundle.replacementAssessments[
                  selectedForReplacement.id
                ]?.[candidate.id] ?? {
                  status: "unavailable" as const,
                  reason: "No contextual assessment was supplied for this pairing.",
                };
                return (
                  <AlternativeCard
                    key={candidate.id}
                    candidate={candidate}
                    assessment={assessment}
                    disabled={submitted || saveState === "saving"}
                    onSourceOpen={openSource}
                    onReplace={() =>
                      void dispatchCommand({
                        ...commandBase(),
                        type: "replace",
                        sectionId: activeSection,
                        slotIndex: activeSlot.slotIndex,
                        alternativeCandidateId: candidate.id,
                      })
                    }
                  />
                );
              })}
            </div>
            <p className="provenance-note">
              Order supplied by {workspace.build.ordering.adapterVersion}. Scores are
              intentionally not shown or recomputed here.
            </p>
          </div>
        </aside>
      </div>

      <footer className="console-footer">
        <span>
          Draft revision {workspace.draft.revision} · {workspace.events.length}{" "}
          interactions captured
        </span>
        <span>
          {isDemo
            ? "Demo mode — browser storage only; no real submission exists."
            : "Console only — no Airtable records are changed here."}
        </span>
      </footer>

      {confirmingSubmit && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="submit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
          >
            <span className="dialog-icon">
              <Icon name="check" />
            </span>
            <p className="overline">{isDemo ? "Demo checkpoint" : "Final check"}</p>
            <h2 id="submit-title">
              {isDemo ? "Simulate this submission?" : "Submit this lineup?"}
            </h2>
            <p>
              {isDemo
                ? "This only records a simulated submitted state in this browser. It does not create a PostgreSQL submission or contact Airtable."
                : "This creates one immutable submission for the issue. It does not write to Airtable or run the copywriter."}
            </p>
            <div className="dialog-summary">
              <span>15 selected events</span>
              <span>{changedCount} changed picks</span>
              <span>{workspace.events.length} captured interactions</span>
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirmingSubmit(false)}>
                Keep editing
              </button>
              <button type="button" className="confirm-submit" onClick={submitDraft}>
                {isDemo ? "Simulate submit" : "Submit lineup"}
                <Icon name="arrow" />
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
