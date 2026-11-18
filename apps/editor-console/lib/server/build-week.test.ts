import { describe, expect, it } from "vitest";

import { latestRun, nextIssueDate, startBuild, torontoDate } from "./build-week";

describe("nextIssueDate", () => {
  it.each([
    ["2026-11-18", "2026-11-26"], // Wednesday run day -> Thursday after next
    ["2026-11-19", "2026-11-26"], // Thursday (publish day) -> next Thursday
    ["2026-11-22", "2026-11-26"], // Sunday -> that week's Thursday
    ["2026-11-23", "2026-11-26"], // Monday, 3 days away
    ["2026-11-24", "2026-12-03"], // Tuesday, 2 days away is too late
    ["2026-12-30", "2027-01-07"], // across a year end
  ])("%s builds for %s", (today, issue) => {
    expect(nextIssueDate(today)).toBe(issue);
  });
});

describe("torontoDate", () => {
  it("uses Toronto's date, not UTC's", () => {
    expect(torontoDate(new Date("2026-11-19T03:30:00Z"))).toBe("2026-11-18");
  });
});

describe("GitHub calls", () => {
  const env = { GITHUB_DISPATCH_TOKEN: "t" };

  it("refuses without a token", async () => {
    await expect(startBuild("2026-11-26", {}, fetch)).rejects.toThrow("GITHUB_DISPATCH_TOKEN");
  });

  it("dispatches the issue date on master", async () => {
    let sent: { url: string; body: unknown } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    await startBuild("2026-11-26", env, fake);
    expect(sent).toEqual({
      url: "https://api.github.com/repos/arielz78/NLAP/actions/workflows/build-week.yml/dispatches",
      body: { ref: "master", inputs: { issue_date: "2026-11-26", publish: "true" } },
    });
  });

  it("reads the issue date from the run name", async () => {
    const fake = (async () =>
      Response.json({
        workflow_runs: [
          {
            display_title: "Build 2026-11-26",
            status: "completed",
            conclusion: "success",
            created_at: "2026-11-18T18:00:00Z",
            html_url: "https://github.com/x",
          },
        ],
      })) as unknown as typeof fetch;
    expect(await latestRun(env, fake)).toMatchObject({
      issueDate: "2026-11-26",
      conclusion: "success",
    });
  });
});
