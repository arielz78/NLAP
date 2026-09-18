import { NextResponse } from "next/server";

import {
  reopenPostgresSubmission,
  StaleDraftError,
  WorkspaceUnavailableError,
} from "@/lib/server/workspace-store";
import { reopenRequestSchema, submissionIdSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const submissionId = submissionIdSchema.safeParse((await params).submissionId);
  if (!submissionId.success) {
    return NextResponse.json(
      { error: "Invalid submission identifier" },
      { status: 400 },
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = reopenRequestSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reopen request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await reopenPostgresSubmission(
        submissionId.data,
        parsed.data.expectedRevision,
        parsed.data.clientEventId,
        parsed.data.occurredAt,
      ),
    );
  } catch (error) {
    const status =
      error instanceof StaleDraftError
        ? 409
        : error instanceof WorkspaceUnavailableError
          ? 503
          : 500;
    return NextResponse.json(
      {
        error:
          status === 503
            ? "The production workspace is unavailable."
            : error instanceof Error
              ? error.message
              : "Reopen failed",
      },
      { status },
    );
  }
}
