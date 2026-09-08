import { NextResponse } from "next/server";

import { loadEditorWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadEditorWorkspace());
}
