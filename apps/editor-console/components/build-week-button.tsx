"use client";

import { useCallback, useEffect, useState } from "react";

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
export function BuildWeekButton() {
  const [state, setState] = useState<BuildState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

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
      <span className="build-week-status running">
        Building {run.issueDate ? day(run.issueDate) : ""} · {minutesSince(run.startedAt)} min
      </span>
    );
  else if (forThisIssue && run.conclusion === "success")
    status = (
      <button type="button" className="build-week-status ready" onClick={() => window.location.reload()}>
        Build ready · open it
      </button>
    );
  else if (forThisIssue && run.conclusion)
    status = (
      <a className="build-week-status failed" href={run.url} target="_blank" rel="noreferrer">
        Last build failed · details
      </a>
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
      {showSteps && run && steps.length > 0 && (
        <div className="build-steps-panel" role="status">
          <div className="build-steps-heading">
            Build {run.issueDate ? day(run.issueDate) : ""} · started {minutesSince(run.startedAt)} min ago
          </div>
          <StepList steps={steps} />
          {steps.some((s) => s.conclusion === "failure") && (
            <p className="build-steps-note">
              Ariel has been emailed. Full details are saved privately for him.
            </p>
          )}
        </div>
      )}
      {state && !running && !starting && (
        <button type="button" className="build-week-button" onClick={() => void start()}>
          {forThisIssue ? "Rebuild" : "Build"} {day(state.issueDate)} issue
        </button>
      )}
    </div>
  );
}
