"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BuildRun = {
  issueDate: string | null;
  status: string;
  conclusion: string | null;
  startedAt: string;
  url: string;
};
type BuildStep = { name: string; status: string; conclusion: string | null; seconds: number | null };
type BuildState = { issueDate: string; run: BuildRun | null; steps?: BuildStep[] };

const duration = (s: number | null) =>
  s === null ? "" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

function StepList({ steps }: { steps: BuildStep[] }) {
  return (
    <ol className="build-steps" aria-label="Build steps">
      {steps.map((step) => {
        const kind =
          step.status !== "completed"
            ? step.status === "in_progress"
              ? "running"
              : "pending"
            : step.conclusion === "success"
              ? "done"
              : step.conclusion === "skipped"
                ? "skipped"
                : "failed";
        const mark = { running: "●", pending: "○", done: "✓", skipped: "–", failed: "✗" }[kind];
        return (
          <li key={step.name} className={`build-step ${kind}`}>
            <span className="build-step-mark" aria-hidden="true">{mark}</span>
            <span className="build-step-name">{step.name}</span>
            <span className="build-step-time">
              {kind === "running" ? "running…" : kind === "skipped" ? "skipped" : duration(step.seconds)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const POLL_MS = 15000;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const day = (date: string) => dayFormatter.format(new Date(`${date}T00:00:00Z`));
const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));

async function fetchBuildState(): Promise<BuildState | { error: string }> {
  try {
    const response = await fetch("/api/build-week", { cache: "no-store" });
    const body = (await response.json()) as BuildState | { error: string };
    if (!response.ok || !("issueDate" in body)) {
      return { error: "error" in body ? body.error : "Build status unavailable." };
    }
    return body;
  } catch {
    return { error: "Build status unavailable." };
  }
}

/** Starts the build-week workflow and follows its latest run until it finishes. */
export function BuildWeekButton({ currentIssueDate }: { currentIssueDate: string }) {
  const [state, setState] = useState<BuildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [confirmingRebuild, setConfirmingRebuild] = useState(false);

  useEffect(() => {
    if (!showSteps && !confirmingRebuild) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowSteps(false);
      setConfirmingRebuild(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showSteps, confirmingRebuild]);

  const refresh = useCallback(
    () =>
      fetchBuildState().then((result) => {
        if ("error" in result) setError(result.error);
        else {
          setState(result);
          setError(null);
        }
      }),
    [],
  );

  const running = Boolean(state?.run && state.run.status !== "completed");

  // Load once, then poll only while a build is starting or running.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchBuildState().then((result) => {
        if (!alive) return;
        if ("error" in result) setError(result.error);
        else {
          setState(result);
          setError(null);
        }
      });
    void load();
    const timer = running || starting ? window.setInterval(() => void load(), POLL_MS) : undefined;
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [running, starting]);

  async function start() {
    setConfirmingRebuild(false);
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/build-week", { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The build could not be started.");
      // GitHub takes a few seconds to list a new run; keep "starting" until it appears.
      window.setTimeout(() => void refresh().finally(() => setStarting(false)), 5000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The build could not be started.");
      setStarting(false);
    }
  }

  if (!state && !error) return null;
  const run = state?.run;
  const forThisIssue = run && state && run.issueDate === state.issueDate;

  let status: React.ReactNode = null;
  if (error) status = <span className="build-week-status failed">{error}</span>;
  else if (starting) status = <span className="build-week-status">Starting…</span>;
  else if (running && run)
    status = (
      <button type="button" className="build-week-pill running" onClick={() => setShowSteps(true)}>
        <span className="build-week-dot" aria-hidden="true" />
        Building {run.issueDate ? day(run.issueDate) : ""} · {minutesSince(run.startedAt)} min
      </button>
    );
  // Ready, and the console is still showing an older issue: offer to open the new slate.
  else if (forThisIssue && run.conclusion === "success" && run.issueDate !== currentIssueDate)
    status = (
      <button type="button" className="build-week-pill ready" onClick={() => window.location.reload()}>
        ✓ {day(run.issueDate!)} slate ready · Open
      </button>
    );
  else if (forThisIssue && run.conclusion && run.conclusion !== "success")
    status = (
      <button type="button" className="build-week-pill failed" onClick={() => setShowSteps(true)}>
        ✗ Build failed · See steps
      </button>
    );

  const steps = state?.steps ?? [];
  return (
    <div className="build-week">
      {status}
      {run && steps.length > 0 && (
        <button
          type="button"
          className="build-week-toggle"
          aria-expanded={showSteps}
          onClick={() => setShowSteps((open) => !open)}
        >
          {showSteps ? "Hide steps" : "Steps"}
        </button>
      )}
      {/* Portalled to <body>: the topbar's backdrop-filter would otherwise pin a fixed dialog to the topbar. */}
      {showSteps && run && steps.length > 0 && createPortal(
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setShowSteps(false)}
        >
          <div className="build-steps-dialog" role="dialog" aria-modal="true" aria-labelledby="build-steps-title">
            <div className="build-steps-header">
              <div>
                <h2 id="build-steps-title">Build {run.issueDate ? day(run.issueDate) : ""} issue</h2>
                <p className="build-steps-sub">
                  {running
                    ? `Running · started ${minutesSince(run.startedAt)} min ago · updates every 15 s`
                    : run.conclusion === "success"
                      ? `Finished · started ${minutesSince(run.startedAt)} min ago`
                      : `Stopped · started ${minutesSince(run.startedAt)} min ago`}
                </p>
              </div>
              <button
                type="button"
                className="build-steps-close"
                aria-label="Close"
                onClick={() => setShowSteps(false)}
              >
                ✕
              </button>
            </div>
            <StepList steps={steps} />
            {steps.some((s) => s.conclusion === "failure") && (
              <p className="build-steps-note">
                Ariel has been emailed. Full details are saved privately for him.
              </p>
            )}
            {!running && run.conclusion === "success" && (
              <button type="button" className="submit-button build-steps-open" onClick={() => window.location.reload()}>
                Open the slate
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
      {state && !running && !starting && (
        <button
          type="button"
          className="build-week-button"
          // A finished build for this issue: ask first, because a rebuild repeats it and changes nothing.
          onClick={() => (forThisIssue && run?.conclusion === "success" ? setConfirmingRebuild(true) : void start())}
        >
          {forThisIssue ? "Rebuild" : "Build"} {day(state.issueDate)} issue
        </button>
      )}
      {confirmingRebuild && state && createPortal(
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => event.target === event.currentTarget && setConfirmingRebuild(false)}
        >
          <div className="submit-dialog" role="dialog" aria-modal="true" aria-labelledby="rebuild-title">
            <h2 id="rebuild-title">The {day(state.issueDate)} slate is already built.</h2>
            <p className="heading-copy">
              Rebuilding runs the same build again on the same events and gives the same slate. It costs
              nothing, but it changes nothing either. Your picks and changes are not affected.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirmingRebuild(false)}>
                Keep the current build
              </button>
              <button type="button" className="confirm-submit" onClick={() => void start()}>
                Rebuild anyway
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
