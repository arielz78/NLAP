/**
 * "Build this week" (ship-plan item 17, Build half): starts the build-week GitHub Actions workflow and
 * reports its latest run. The workflow does the work (runWeek -> bundle -> publish); this only asks
 * GitHub to start it and reads back its status. Needs GITHUB_DISPATCH_TOKEN: a fine-grained token on
 * arielz78/NLAP with Actions read and write.
 */

const REPO = "arielz78/NLAP";
const WORKFLOW = "build-week.yml";
const API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;

export type BuildStep = {
  name: string;
  status: "queued" | "in_progress" | "completed" | "pending" | string;
  conclusion: string | null;
  seconds: number | null;
};

export type BuildRun = {
  id: number;
  issueDate: string | null;
  status: "queued" | "in_progress" | "completed" | string;
  conclusion: string | null;
  startedAt: string;
  url: string;
};

export class BuildWeekError extends Error {}

/** Toronto's calendar date for an instant, as YYYY-MM-DD. */
export function torontoDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The issue a build made today is for: the first Thursday at least 3 days away. A Wednesday build
 * is for the Thursday after next (8 days); a Sunday build is for that week's Thursday (4 days).
 */
export function nextIssueDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  const daysToThursday = (4 - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + (daysToThursday < 3 ? daysToThursday + 7 : daysToThursday));
  return date.toISOString().slice(0, 10);
}

function headers(env: Record<string, string | undefined>) {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) throw new BuildWeekError("The Build button is not set up: GITHUB_DISPATCH_TOKEN is missing.");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function startBuild(
  issueDate: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${API}/dispatches`, {
    method: "POST",
    headers: { ...headers(env), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "master", inputs: { issue_date: issueDate, publish: "true" } }),
  });
  if (response.status !== 204) {
    throw new BuildWeekError(`GitHub did not start the build (HTTP ${response.status}).`);
  }
}

// The workflow's steps, grouped into what the editor needs to see. A step not listed here is hidden.
const STEP_GROUPS: Array<[label: string, steps: string[]]> = [
  ["Set up the server", ["Check the issue date", "Run actions/checkout@v4", "Check out the private data repo", "Make the private log folder"]],
  ["Collect this week's events (R1)", ["R1 — prepare the workflow and the credential", "R1 — run"]],
  ["Install the pipeline", ["Lay the private files over the code", "Run actions/setup-node@v4", "Run npm ci", "Run actions/setup-python@v5", "Python environment where runWeek looks for it"]],
  ["Filter, score and rank the events", ["Run the week"]],
  ["Publish the slate to the console", ["Make the console bundle", "Publish to the console"]],
  ["Save the run's files", ["Save the run's files to NLAP-data"]],
];

type GitHubStep = { name: string; status: string; conclusion: string | null; started_at?: string | null; completed_at?: string | null };

export function groupSteps(steps: GitHubStep[]): BuildStep[] {
  return STEP_GROUPS.map(([name, members]) => {
    const own = steps.filter((s) => members.includes(s.name));
    const done = own.filter((s) => s.status === "completed");
    const failed = done.find((s) => s.conclusion === "failure" || s.conclusion === "cancelled");
    let status = "pending";
    let conclusion: string | null = null;
    if (failed) [status, conclusion] = ["completed", failed.conclusion];
    else if (own.length && done.length === own.length)
      [status, conclusion] = ["completed", done.every((s) => s.conclusion === "skipped") ? "skipped" : "success"];
    else if (own.some((s) => s.status === "in_progress") || done.length) status = "in_progress";
    const seconds = own.reduce((sum, s) => {
      const start = Date.parse(s.started_at ?? ""), end = Date.parse(s.completed_at ?? "");
      return Number.isFinite(start) && Number.isFinite(end) ? sum + Math.max(0, (end - start) / 1000) : sum;
    }, 0);
    return { name, status, conclusion, seconds: done.length ? Math.round(seconds) : null };
  });
}

export async function runSteps(
  runId: number,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<BuildStep[]> {
  const response = await fetchImpl(`https://api.github.com/repos/${REPO}/actions/runs/${runId}/jobs`, {
    headers: headers(env),
    cache: "no-store",
  });
  if (!response.ok) throw new BuildWeekError(`GitHub did not answer (HTTP ${response.status}).`);
  const body = (await response.json()) as { jobs?: Array<{ steps?: GitHubStep[] }> };
  return groupSteps(body.jobs?.[0]?.steps ?? []);
}

export async function latestRun(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<BuildRun | null> {
  const response = await fetchImpl(`${API}/runs?per_page=1&event=workflow_dispatch`, {
    headers: headers(env),
    cache: "no-store",
  });
  if (!response.ok) throw new BuildWeekError(`GitHub did not answer (HTTP ${response.status}).`);
  const body = (await response.json()) as {
    workflow_runs?: Array<{
      id: number;
      display_title?: string;
      status: string;
      conclusion: string | null;
      run_started_at?: string;
      created_at: string;
      html_url: string;
    }>;
  };
  const run = body.workflow_runs?.[0];
  if (!run) return null;
  return {
    id: run.id,
    issueDate: /\d{4}-\d{2}-\d{2}/.exec(run.display_title ?? "")?.[0] ?? null,
    status: run.status,
    conclusion: run.conclusion,
    startedAt: run.run_started_at ?? run.created_at,
    url: run.html_url,
  };
}
