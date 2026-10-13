import { EditorConsole } from "@/components/editor-console";
import { loadEditorWorkspace } from "@/lib/server/workspace-store";

export const dynamic = "force-dynamic";

async function getWorkspace() {
  try {
    return { workspace: await loadEditorWorkspace(), unavailable: false as const };
  } catch (error) {
    // The page shows one blocking message for every cause; the server log names the cause.
    // A driver error can quote the connection string, so it is hidden before logging.
    const describe = (value: unknown) =>
      (value instanceof Error ? value.message : String(value)).replace(
        /postgres(?:ql)?:\/\/\S+/gi,
        "[connection string hidden]",
      );
    const cause = error instanceof Error ? error.cause : undefined;
    console.error(
      `Workspace unavailable: ${describe(error)}${cause ? ` Cause: ${describe(cause)}` : ""}`,
    );
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
