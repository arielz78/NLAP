import { NextResponse } from "next/server";

import {
  listPostgresSubmissions,
  WorkspaceUnavailableError,
} from "@/lib/server/workspace-store";
import { issueBuildIdSchema } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ issueBuildId: string }> },
) {
  const issueBuildId = issueBuildIdSchema.safeParse((await params).issueBuildId);
  if (!issueBuildId.success) {
    return NextResponse.json(
      { error: "Invalid issue-build identifier" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      submissions: await listPostgresSubmissions(issueBuildId.data),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof WorkspaceUnavailableError
            ? "The production workspace is unavailable."
            : "Submissions could not be loaded.",
      },
      { status: error instanceof WorkspaceUnavailableError ? 503 : 500 },
    );
  }
}
