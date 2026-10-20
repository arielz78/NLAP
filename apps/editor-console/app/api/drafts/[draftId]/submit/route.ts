import { after, NextResponse } from "next/server";

import { notifySubmission } from "@/lib/server/notify-submission";
import {
  StaleDraftError,
  submitPostgresDraft,
  WorkspaceUnavailableError,
} from "@/lib/server/workspace-store";
import { draftIdSchema, submitRequestSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const draftId = draftIdSchema.safeParse((await params).draftId);
  if (!draftId.success) {
    return NextResponse.json({ error: "Invalid draft identifier" }, { status: 400 });
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = submitRequestSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await submitPostgresDraft(
      draftId.data,
      parsed.data.expectedRevision,
      parsed.data.clientEventId,
      parsed.data.occurredAt,
    );
    after(() => notifySubmission(result.submission));
    return NextResponse.json(result);
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
              : "Submission failed",
      },
      { status },
    );
  }
}
