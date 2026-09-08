import { EditorConsole } from "@/components/editor-console";
import { loadEditorWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const workspace = await loadEditorWorkspace();
  return <EditorConsole initialWorkspace={workspace} />;
}
