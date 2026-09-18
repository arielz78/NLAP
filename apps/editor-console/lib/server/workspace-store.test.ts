import { describe, expect, it } from "vitest";

import {
  loadEditorWorkspaceForConfig,
  resolveRuntimeConfig,
  WorkspaceUnavailableError,
} from "./workspace-store";

describe("editor-console runtime mode", () => {
  it("requires demo or production mode explicitly", () => {
    expect(() => resolveRuntimeConfig({})).toThrow(WorkspaceUnavailableError);
  });

  it("never falls back to a browser fixture after a production load failure", async () => {
    const config = resolveRuntimeConfig({
      EDITOR_CONSOLE_MODE: "production",
      DATABASE_URL: "postgresql://isolated.invalid/test",
      EDITOR_IDENTITY: "fixture-editor",
    });

    await expect(
      loadEditorWorkspaceForConfig(config, async () => {
        throw new Error("simulated query failure");
      }),
    ).rejects.toThrow("could not be loaded from PostgreSQL");
  });

  it("uses the browser fixture only in explicit demo mode", async () => {
    const config = resolveRuntimeConfig({ EDITOR_CONSOLE_MODE: "demo" });
    const workspace = await loadEditorWorkspaceForConfig(config, async () => {
      throw new Error("demo mode must not query PostgreSQL");
    });

    expect(workspace.persistence).toBe("browser-demo");
  });
});
