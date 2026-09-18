import { NextResponse } from "next/server";

import {
  loadEditorWorkspace,
  WorkspaceUnavailableError,
} from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadEditorWorkspace());
  } catch (error) {
    const status = error instanceof WorkspaceUnavailableError ? 503 : 500;
    return NextResponse.json(
      {
        error:
          status === 503
            ? "The production workspace is unavailable. No demo data was loaded."
            : "The workspace could not be loaded.",
      },
      { status },
    );
  }
}
