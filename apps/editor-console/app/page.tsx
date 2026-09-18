import { EditorConsole } from "@/components/editor-console";
import { loadEditorWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

async function getWorkspace() {
  try {
    return { workspace: await loadEditorWorkspace(), unavailable: false as const };
  } catch {
    return { workspace: null, unavailable: true as const };
  }
}

export default async function Home() {
  const result = await getWorkspace();
  if (!result.unavailable) {
    return <EditorConsole initialWorkspace={result.workspace} />;
  }

  return (
    <main className="blocking-state" role="alert">
      <div className="brand-mark">VB</div>
      <p className="overline">Production unavailable</p>
      <h1>The editor console could not load its PostgreSQL workspace.</h1>
      <p>
        Editing and submission are blocked. No browser fixture was loaded and no
        demo submission can be created. Ask the operator to verify the console
        mode, database connection, and schema migrations, then reload this page.
      </p>
    </main>
  );
}
