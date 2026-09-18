import "server-only";

import { neon } from "@neondatabase/serverless";

import type {
  CommandResult,
  DraftCommand,
  DraftSnapshot,
  EditorWorkspace,
  InteractionEvent,
  IssueBuild,
  RuntimeMode,
  SubmissionSnapshot,
} from "@/lib/contracts";
import {
  applyDraftCommand,
  createInitialDraft,
  createReopenedDraft,
  createSubmission,
} from "@/lib/draft-domain";
import { mockIssueBuild } from "@/lib/mock-issue";

const DEMO_DRAFT_ID = "20000000-0000-4000-8000-000000000001";
const DEMO_EDITOR_IDENTITY = "demo-editor";

function createSqlClient(url: string) {
  return neon(url);
}

type SqlClient = ReturnType<typeof createSqlClient>;

interface DraftRow {
  id: string;
  issue_build_id: string;
  issue_revision: number;
  editor_id: string;
  reopened_from_submission_id: string | null;
  revision: number;
  status: DraftSnapshot["status"];
  state: DraftSnapshot;
  updated_at: string;
  is_current: boolean;
}

interface EventRow {
  client_event_id: string;
  event_type: InteractionEvent["type"];
  draft_revision: number;
  occurred_at: string;
  incomplete: boolean;
  payload: Record<string, unknown>;
}

interface SubmissionRow {
  submission_id: string;
  submit_client_event_id: string;
  draft_id: string;
  issue_build_id: string;
  issue_key: string;
  build_version: number;
  issue_revision: number;
  editor_id: string;
  draft_revision: number;
  submitted_at: string;
  snapshot: SubmissionSnapshot;
}

export interface RuntimeConfig {
  mode: RuntimeMode;
  connectionString: string | null;
  editorIdentity: string;
}

export class StaleDraftError extends Error {
  constructor() {
    super("The draft changed in another session. Reload before continuing.");
  }
}

export class WorkspaceUnavailableError extends Error {
  constructor(message = "The production workspace is unavailable.", options?: ErrorOptions) {
    super(message, options);
  }
}

export function resolveRuntimeConfig(
  values: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  const mode = values.EDITOR_CONSOLE_MODE?.trim();
  if (mode !== "demo" && mode !== "production") {
    throw new WorkspaceUnavailableError(
      "EDITOR_CONSOLE_MODE must be set to demo or production.",
    );
  }

  if (mode === "demo") {
    return {
      mode,
      connectionString: null,
      editorIdentity: DEMO_EDITOR_IDENTITY,
    };
  }

  const connectionString = values.DATABASE_URL?.trim();
  const editorIdentity = values.EDITOR_IDENTITY?.trim();
  if (!connectionString || !editorIdentity) {
    throw new WorkspaceUnavailableError(
      "Production mode requires DATABASE_URL and EDITOR_IDENTITY.",
    );
  }

  return { mode, connectionString, editorIdentity };
}

function demoWorkspace(): EditorWorkspace {
  return {
    build: mockIssueBuild,
    draft: createInitialDraft(mockIssueBuild, {
      draftId: DEMO_DRAFT_ID,
      editorIdentity: DEMO_EDITOR_IDENTITY,
    }),
    events: [],
    persistence: "browser-demo",
    notice:
      "Explicit demo mode: this fixture is stored only in this browser and never becomes a real submission.",
    submissionHistory: [],
  };
}

function rowToEvent(row: EventRow): InteractionEvent {
  return {
    clientEventId: row.client_event_id,
    type: row.event_type,
    draftRevision: row.draft_revision,
    occurredAt: new Date(row.occurred_at).toISOString(),
    incomplete: row.incomplete,
    payload: row.payload,
  };
}

function rowToSubmission(row: SubmissionRow): SubmissionSnapshot {
  return {
    ...row.snapshot,
    submissionId: row.submission_id,
    submitClientEventId: row.submit_client_event_id,
    issueBuildId: row.issue_build_id,
    issueKey: row.issue_key,
    buildVersion: row.build_version,
    revision: row.issue_revision,
    editorIdentity: row.editor_id,
    draftId: row.draft_id,
    draftRevision: row.draft_revision,
    submittedAt: new Date(row.submitted_at).toISOString(),
    replacements: row.snapshot.replacements ?? [],
  };
}

export class PostgresWorkspaceStore {
  constructor(
    private readonly sql: SqlClient,
    private readonly editorIdentity: string,
  ) {}

  static connect(connectionString: string, editorIdentity: string) {
    return new PostgresWorkspaceStore(
      createSqlClient(connectionString),
      editorIdentity,
    );
  }

  async loadWorkspaceByDraftId(draftId: string): Promise<EditorWorkspace | null> {
    const rows = (await this.sql`
      SELECT
        d.id,
        d.issue_build_id,
        d.issue_revision,
        d.editor_id,
        d.reopened_from_submission_id,
        d.revision,
        d.status,
        d.state,
        d.updated_at,
        d.is_current,
        b.bundle
      FROM drafts d
      JOIN issue_builds b ON b.id = d.issue_build_id
      WHERE d.id = ${draftId}::uuid
      LIMIT 1
    `) as unknown as Array<DraftRow & { bundle: IssueBuild }>;

    if (!rows[0]) return null;
    const row = rows[0];

    const eventRows = (await this.sql`
      SELECT client_event_id, event_type, draft_revision, occurred_at, incomplete, payload
      FROM interaction_events
      WHERE draft_id = ${draftId}::uuid
      ORDER BY draft_revision, recorded_at
    `) as unknown as EventRow[];
    const submissionRows = (await this.sql`
      SELECT
        submission_id,
        submit_client_event_id,
        draft_id,
        issue_build_id,
        issue_key,
        build_version,
        issue_revision,
        editor_id,
        draft_revision,
        submitted_at,
        snapshot
      FROM submissions
      WHERE issue_build_id = ${row.issue_build_id}::uuid
      ORDER BY issue_revision
    `) as unknown as SubmissionRow[];
    const submissionHistory = submissionRows.map(rowToSubmission);

    return {
      build: row.bundle,
      draft: {
        ...row.state,
        id: row.id,
        issueBuildId: row.issue_build_id,
        issueRevision: row.issue_revision,
        editorIdentity: row.editor_id,
        reopenedFromSubmissionId: row.reopened_from_submission_id ?? undefined,
        revision: row.revision,
        status: row.status,
        updatedAt: new Date(row.updated_at).toISOString(),
      },
      events: eventRows.map(rowToEvent),
      persistence: "postgres",
      submission: submissionHistory.find(
        (submission) => submission.draftId === row.id,
      ),
      baseSubmission: submissionHistory.find(
        (submission) =>
          submission.submissionId === row.reopened_from_submission_id,
      ),
      submissionHistory,
    };
  }

  async loadWorkspaceForBuild(issueBuildId: string) {
    const builds = (await this.sql`
      SELECT id, bundle
      FROM issue_builds
      WHERE id = ${issueBuildId}::uuid
      LIMIT 1
    `) as unknown as Array<{ id: string; bundle: IssueBuild }>;

    if (!builds[0]) return null;

    const currentDrafts = (await this.sql`
      SELECT id
      FROM drafts
      WHERE issue_build_id = ${issueBuildId}::uuid
        AND is_current
      LIMIT 1
    `) as unknown as Array<{ id: string }>;

    let draftId = currentDrafts[0]?.id;
    if (!draftId) {
      const initial = createInitialDraft(builds[0].bundle, {
        editorIdentity: this.editorIdentity,
      });
      const inserted = (await this.sql`
        INSERT INTO drafts (
          id,
          issue_build_id,
          issue_revision,
          editor_id,
          revision,
          status,
          state,
          is_current,
          updated_at
        )
        VALUES (
          ${initial.id}::uuid,
          ${issueBuildId}::uuid,
          ${initial.issueRevision},
          ${initial.editorIdentity},
          ${initial.revision},
          ${initial.status},
          ${JSON.stringify(initial)}::jsonb,
          true,
          ${initial.updatedAt}::timestamptz
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as unknown as Array<{ id: string }>;

      draftId = inserted[0]?.id;
      if (!draftId) {
        const raced = (await this.sql`
          SELECT id
          FROM drafts
          WHERE issue_build_id = ${issueBuildId}::uuid
            AND is_current
          LIMIT 1
        `) as unknown as Array<{ id: string }>;
        draftId = raced[0]?.id;
      }
    }

    return draftId ? this.loadWorkspaceByDraftId(draftId) : null;
  }

  async loadLatestWorkspace() {
    const builds = (await this.sql`
      SELECT id
      FROM issue_builds
      ORDER BY issue_date DESC, build_version DESC
      LIMIT 1
    `) as unknown as Array<{ id: string }>;

    return builds[0] ? this.loadWorkspaceForBuild(builds[0].id) : null;
  }

  private async duplicateCommand(
    draftId: string,
    clientEventId: string,
  ): Promise<CommandResult | null> {
    const duplicateRows = (await this.sql`
      SELECT draft_id
      FROM interaction_events
      WHERE client_event_id = ${clientEventId}::uuid
      LIMIT 1
    `) as unknown as Array<{ draft_id: string }>;
    if (!duplicateRows[0]) return null;
    if (duplicateRows[0].draft_id !== draftId) {
      throw new Error("That idempotency key belongs to another draft.");
    }

    const workspace = await this.loadWorkspaceByDraftId(draftId);
    const event = workspace?.events.find(
      (item) => item.clientEventId === clientEventId,
    );
    return workspace && event ? { draft: workspace.draft, event } : null;
  }

  async applyCommand(
    draftId: string,
    expectedRevision: number,
    command: DraftCommand,
  ): Promise<CommandResult> {
    const duplicate = await this.duplicateCommand(draftId, command.clientEventId);
    if (duplicate) return duplicate;

    const rows = (await this.sql`
      SELECT
        d.issue_revision,
        d.editor_id,
        d.reopened_from_submission_id,
        d.revision,
        d.status,
        d.state,
        d.is_current,
        b.bundle
      FROM drafts d
      JOIN issue_builds b ON b.id = d.issue_build_id
      WHERE d.id = ${draftId}::uuid
      LIMIT 1
    `) as unknown as Array<{
      revision: number;
      issue_revision: number;
      editor_id: string;
      reopened_from_submission_id: string | null;
      status: DraftSnapshot["status"];
      state: DraftSnapshot;
      is_current: boolean;
      bundle: IssueBuild;
    }>;

    if (!rows[0]) throw new Error("Draft not found.");
    if (!rows[0].is_current || rows[0].revision !== expectedRevision) {
      throw new StaleDraftError();
    }

    const currentDraft = {
      ...rows[0].state,
      issueRevision: rows[0].issue_revision,
      editorIdentity: rows[0].editor_id,
      reopenedFromSubmissionId:
        rows[0].reopened_from_submission_id ?? undefined,
      revision: rows[0].revision,
      status: rows[0].status,
    };
    const result = applyDraftCommand(rows[0].bundle, currentDraft, command);

    try {
      const persisted = (await this.sql`
        WITH updated AS (
          UPDATE drafts
          SET revision = ${result.draft.revision},
              state = ${JSON.stringify(result.draft)}::jsonb,
              updated_at = ${result.draft.updatedAt}::timestamptz
          WHERE id = ${draftId}::uuid
            AND revision = ${expectedRevision}
            AND status = 'draft'
            AND is_current
          RETURNING id
        )
        INSERT INTO interaction_events (
          client_event_id,
          draft_id,
          draft_revision,
          event_type,
          payload,
          incomplete,
          occurred_at
        )
        SELECT
          ${result.event.clientEventId}::uuid,
          id,
          ${result.event.draftRevision},
          ${result.event.type},
          ${JSON.stringify(result.event.payload)}::jsonb,
          ${result.event.incomplete},
          ${result.event.occurredAt}::timestamptz
        FROM updated
        RETURNING client_event_id
      `) as unknown as Array<{ client_event_id: string }>;

      if (!persisted[0]) throw new StaleDraftError();
      return result;
    } catch (error) {
      const retried = await this.duplicateCommand(draftId, command.clientEventId);
      if (retried) return retried;
      throw error;
    }
  }

  private async duplicateSubmit(
    draftId: string,
    clientEventId: string,
  ): Promise<SubmitResult | null> {
    const workspace = await this.loadWorkspaceByDraftId(draftId);
    const event = workspace?.events.find(
      (item) => item.clientEventId === clientEventId && item.type === "submit",
    );
    if (!workspace?.submission || !event) return null;
    return {
      draft: workspace.draft,
      event,
      submission: workspace.submission,
    };
  }

  async submitDraft(
    draftId: string,
    expectedRevision: number,
    clientEventId: string,
    occurredAt: string,
  ): Promise<SubmitResult> {
    const duplicate = await this.duplicateSubmit(draftId, clientEventId);
    if (duplicate) return duplicate;

    const workspace = await this.loadWorkspaceByDraftId(draftId);
    if (!workspace) throw new Error("Draft not found.");
    if (workspace.submission) throw new Error("This revision has already been submitted.");
    if (workspace.draft.revision !== expectedRevision) throw new StaleDraftError();

    const submittedAt = new Date().toISOString();
    const submission = createSubmission(workspace, {
      submitClientEventId: clientEventId,
      editorIdentity: this.editorIdentity,
      submittedAt,
    });
    const draft: DraftSnapshot = {
      ...workspace.draft,
      editorIdentity: this.editorIdentity,
      revision: expectedRevision + 1,
      status: "submitted",
      updatedAt: submittedAt,
    };
    const event: InteractionEvent = {
      clientEventId,
      type: "submit",
      draftRevision: draft.revision,
      occurredAt,
      incomplete: false,
      payload: {
        submissionId: submission.submissionId,
        issueRevision: submission.revision,
        trainingPairCount: submission.trainingPairs.length,
        incompleteEventCount: submission.incompleteEventCount,
      },
    };

    try {
      const persisted = (await this.sql`
        WITH updated AS (
          UPDATE drafts
          SET revision = ${draft.revision},
              editor_id = ${this.editorIdentity},
              status = 'submitted',
              state = ${JSON.stringify(draft)}::jsonb,
              updated_at = ${submittedAt}::timestamptz
          WHERE id = ${draftId}::uuid
            AND revision = ${expectedRevision}
            AND status = 'draft'
            AND is_current
          RETURNING id, issue_build_id, issue_revision
        ), created_submission AS (
          INSERT INTO submissions (
            submission_id,
            submit_client_event_id,
            draft_id,
            issue_build_id,
            issue_key,
            build_version,
            issue_revision,
            editor_id,
            draft_revision,
            snapshot,
            submitted_at
          )
          SELECT
            ${submission.submissionId}::uuid,
            ${clientEventId}::uuid,
            id,
            issue_build_id,
            ${submission.issueKey},
            ${submission.buildVersion},
            issue_revision,
            ${this.editorIdentity},
            ${submission.draftRevision},
            ${JSON.stringify(submission)}::jsonb,
            ${submittedAt}::timestamptz
          FROM updated
          RETURNING id
        ), created_event AS (
          INSERT INTO interaction_events (
            client_event_id,
            draft_id,
            draft_revision,
            event_type,
            payload,
            incomplete,
            occurred_at
          )
          SELECT
            ${event.clientEventId}::uuid,
            id,
            ${event.draftRevision},
            'submit',
            ${JSON.stringify(event.payload)}::jsonb,
            false,
            ${event.occurredAt}::timestamptz
          FROM updated
          RETURNING id
        )
        SELECT created_submission.id
        FROM created_submission
        CROSS JOIN created_event
      `) as unknown as Array<{ id: string }>;

      if (!persisted[0]) throw new StaleDraftError();
      return { draft, event, submission };
    } catch (error) {
      const retried = await this.duplicateSubmit(draftId, clientEventId);
      if (retried) return retried;
      throw error;
    }
  }

  private async duplicateReopen(clientEventId: string, submissionId: string) {
    const duplicateRows = (await this.sql`
      SELECT draft_id, payload ->> 'previousSubmissionId' AS previous_submission_id
      FROM interaction_events
      WHERE client_event_id = ${clientEventId}::uuid
        AND event_type = 'reopen'
      LIMIT 1
    `) as unknown as Array<{
      draft_id: string;
      previous_submission_id: string;
    }>;
    if (
      duplicateRows[0] &&
      duplicateRows[0].previous_submission_id !== submissionId
    ) {
      throw new Error("That idempotency key belongs to another submission.");
    }
    return duplicateRows[0]
      ? this.loadWorkspaceByDraftId(duplicateRows[0].draft_id)
      : null;
  }

  async reopenSubmission(
    submissionId: string,
    expectedRevision: number,
    clientEventId: string,
    occurredAt: string,
  ): Promise<EditorWorkspace> {
    const duplicate = await this.duplicateReopen(clientEventId, submissionId);
    if (duplicate) return duplicate;

    const submissionRows = (await this.sql`
      SELECT draft_id
      FROM submissions
      WHERE submission_id = ${submissionId}::uuid
      LIMIT 1
    `) as unknown as Array<{ draft_id: string }>;
    if (!submissionRows[0]) throw new Error("Submission not found.");

    const workspace = await this.loadWorkspaceByDraftId(submissionRows[0].draft_id);
    if (!workspace?.submission || workspace.submission.submissionId !== submissionId) {
      throw new Error("Submission not found.");
    }
    if (
      workspace.draft.status !== "submitted" ||
      workspace.draft.revision !== expectedRevision
    ) {
      throw new StaleDraftError();
    }

    const reopenedAt = new Date().toISOString();
    const draft = createReopenedDraft(workspace, {
      editorIdentity: this.editorIdentity,
      reopenedAt,
    });
    const event: InteractionEvent = {
      clientEventId,
      type: "reopen",
      draftRevision: 0,
      occurredAt,
      incomplete: false,
      payload: {
        previousSubmissionId: submissionId,
        issueBuildId: workspace.build.id,
        issueRevision: draft.issueRevision,
        editorIdentity: this.editorIdentity,
      },
    };

    try {
      const persisted = (await this.sql`
        WITH retired AS (
          UPDATE drafts
          SET is_current = false,
              updated_at = ${reopenedAt}::timestamptz
          WHERE id = ${workspace.draft.id}::uuid
            AND revision = ${expectedRevision}
            AND status = 'submitted'
            AND is_current
          RETURNING issue_build_id
        ), created_draft AS (
          INSERT INTO drafts (
            id,
            issue_build_id,
            issue_revision,
            editor_id,
            reopened_from_submission_id,
            revision,
            status,
            state,
            is_current,
            updated_at
          )
          SELECT
            ${draft.id}::uuid,
            issue_build_id,
            ${draft.issueRevision},
            ${draft.editorIdentity},
            ${submissionId}::uuid,
            0,
            'draft',
            ${JSON.stringify(draft)}::jsonb,
            true,
            ${reopenedAt}::timestamptz
          FROM retired
          RETURNING id
        ), created_event AS (
          INSERT INTO interaction_events (
            client_event_id,
            draft_id,
            draft_revision,
            event_type,
            payload,
            incomplete,
            occurred_at
          )
          SELECT
            ${clientEventId}::uuid,
            id,
            0,
            'reopen',
            ${JSON.stringify(event.payload)}::jsonb,
            false,
            ${occurredAt}::timestamptz
          FROM created_draft
          RETURNING draft_id
        )
        SELECT draft_id FROM created_event
      `) as unknown as Array<{ draft_id: string }>;

      if (!persisted[0]) throw new StaleDraftError();
      const reopened = await this.loadWorkspaceByDraftId(persisted[0].draft_id);
      if (!reopened) throw new WorkspaceUnavailableError();
      return reopened;
    } catch (error) {
      const retried = await this.duplicateReopen(clientEventId, submissionId);
      if (retried) return retried;
      throw error;
    }
  }

  async listSubmissions(issueBuildId: string) {
    const rows = (await this.sql`
      SELECT
        submission_id,
        submit_client_event_id,
        draft_id,
        issue_build_id,
        issue_key,
        build_version,
        issue_revision,
        editor_id,
        draft_revision,
        submitted_at,
        snapshot
      FROM submissions
      WHERE issue_build_id = ${issueBuildId}::uuid
      ORDER BY issue_revision
    `) as unknown as SubmissionRow[];
    return rows.map(rowToSubmission);
  }
}

function productionStore() {
  const config = resolveRuntimeConfig();
  if (config.mode !== "production" || !config.connectionString) {
    throw new WorkspaceUnavailableError(
      "PostgreSQL APIs are unavailable while the console is in demo mode.",
    );
  }
  return PostgresWorkspaceStore.connect(
    config.connectionString,
    config.editorIdentity,
  );
}

export async function loadEditorWorkspace(): Promise<EditorWorkspace> {
  const config = resolveRuntimeConfig();
  return loadEditorWorkspaceForConfig(config, async () => {
    return PostgresWorkspaceStore.connect(
      config.connectionString!,
      config.editorIdentity,
    ).loadLatestWorkspace();
  });
}

export async function loadEditorWorkspaceForConfig(
  config: RuntimeConfig,
  loadProduction: () => Promise<EditorWorkspace | null>,
): Promise<EditorWorkspace> {
  if (config.mode === "demo") return demoWorkspace();

  try {
    const workspace = await loadProduction();
    if (!workspace) {
      throw new WorkspaceUnavailableError(
        "PostgreSQL is connected but has no issue build.",
      );
    }
    return workspace;
  } catch (error) {
    if (error instanceof WorkspaceUnavailableError) throw error;
    throw new WorkspaceUnavailableError(
      "The production workspace could not be loaded from PostgreSQL.",
      { cause: error },
    );
  }
}

export async function applyPostgresCommand(
  draftId: string,
  expectedRevision: number,
  command: DraftCommand,
) {
  return productionStore().applyCommand(draftId, expectedRevision, command);
}

export interface SubmitResult {
  draft: DraftSnapshot;
  event: InteractionEvent;
  submission: SubmissionSnapshot;
}

export async function submitPostgresDraft(
  draftId: string,
  expectedRevision: number,
  clientEventId: string,
  occurredAt: string,
) {
  return productionStore().submitDraft(
    draftId,
    expectedRevision,
    clientEventId,
    occurredAt,
  );
}

export async function reopenPostgresSubmission(
  submissionId: string,
  expectedRevision: number,
  clientEventId: string,
  occurredAt: string,
) {
  return productionStore().reopenSubmission(
    submissionId,
    expectedRevision,
    clientEventId,
    occurredAt,
  );
}

export async function listPostgresSubmissions(issueBuildId: string) {
  return productionStore().listSubmissions(issueBuildId);
}
