import { NextResponse } from "next/server";

import {
  applyPostgresCommand,
  StaleDraftError,
} from "@/lib/server/workspace-store";
import { commandRequestSchema, draftIdSchema } from "@/lib/validation";

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

  const parsed = commandRequestSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid command", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await applyPostgresCommand(
        draftId.data,
        parsed.data.expectedRevision,
        parsed.data.command,
      ),
    );
  } catch (error) {
    const status = error instanceof StaleDraftError ? 409 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Command failed" },
      { status },
    );
  }
}
