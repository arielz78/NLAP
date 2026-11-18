import { NextResponse } from "next/server";

import {
  BuildWeekError,
  latestRun,
  nextIssueDate,
  startBuild,
  torontoDate,
} from "@/lib/server/build-week";

export const dynamic = "force-dynamic";

// Signed-in only: proxy.ts guards every /api route.

export async function GET() {
  try {
    return NextResponse.json({
      issueDate: nextIssueDate(torontoDate(new Date())),
      run: await latestRun(),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  try {
    const run = await latestRun();
    if (run && run.status !== "completed") {
      return NextResponse.json({ error: "A build is already running." }, { status: 409 });
    }
    const issueDate = nextIssueDate(torontoDate(new Date()));
    await startBuild(issueDate);
    return NextResponse.json({ issueDate, started: true }, { status: 202 });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  const known = error instanceof BuildWeekError;
  if (!known) console.error("Build week:", error);
  return NextResponse.json(
    { error: known ? error.message : "The build could not be started." },
    { status: known ? 503 : 500 },
  );
}
