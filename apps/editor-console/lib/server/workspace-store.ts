import "server-only";

import { neon } from "@neondatabase/serverless";

import type {
  CommandResult,
  DraftCommand,
  DraftSnapshot,
  EditorWorkspace,
  InteractionEvent,
  IssueBuild,
  SubmissionSnapshot,
} from "@/lib/contracts";
import {
  applyDraftCommand,
  createInitialDraft,
  createSubmission,
} from "@/lib/draft-domain";
import { mockIssueBuild } from "@/lib/mock-issue";

const DEMO_DRAFT_ID = "20000000-0000-4000-8000-000000000001";

function createSqlClient(url: string) {
  return neon(url);
}

type SqlClient = ReturnType<typeof createSqlClient>;

interface DraftRow {
  id: string;
  revision: number;
  status: DraftSnapshot["status"];
  state: DraftSnapshot;
  updated_at: string;
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
  snapshot: SubmissionSnapshot;
}

export class StaleDraftError extends Error {
  constructor() {
    super("The draft changed in another session. Reload before continuing.");
  }
}

function connectionString() {
  const value = process.env.DATABASE_URL?.trim();
  return value || null;
}

function demoWorkspace(notice?: string): EditorWorkspace {
  return {
    build: mockIssueBuild,
    draft: createInitialDraft(mockIssueBuild, DEMO_DRAFT_ID),
    events: [],
    persistence: "browser-demo",
    notice:
      notice ??
      "Fixture mode: this draft is stored in this browser until PostgreSQL is configured.",
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

async function loadWorkspaceByDraftId(
  sql: SqlClient,
  draftId: string,
): Promise<EditorWorkspace | null> {
  const rows = (await sql`
    SELECT d.id, d.revision, d.status, d.state, d.updated_at, b.bundle
    FROM drafts d
    JOIN issue_builds b ON b.id = d.issue_build_id
    WHERE d.id = ${draftId}::uuid
    LIMIT 1
  `) as unknown as Array<DraftRow & { bundle: IssueBuild }>;

  if (!rows[0]) return null;

  const eventRows = (await sql`
    SELECT client_event_id, event_type, draft_revision, occurred_at, incomplete, payload
    FROM interaction_events
    WHERE draft_id = ${draftId}::uuid
    ORDER BY draft_revision, recorded_at
  `) as unknown as EventRow[];
  const submissionRows = (await sql`
    SELECT snapshot
    FROM submissions
    WHERE draft_id = ${draftId}::uuid
    LIMIT 1
  `) as unknown as SubmissionRow[];

  return {
    build: rows[0].bundle,
    draft: {
      ...rows[0].state,
      revision: rows[0].revision,
      status: rows[0].status,
      updatedAt: new Date(rows[0].updated_at).toISOString(),
    },
    events: eventRows.map(rowToEvent),
    persistence: "postgres",
    submission: submissionRows[0]?.snapshot,
  };
}

async function loadLatestPostgresWorkspace(sql: SqlClient) {
  const builds = (await sql`
    SELECT id, bundle
    FROM issue_builds
    ORDER BY issue_date DESC, build_version DESC
    LIMIT 1
  `) as unknown as Array<{ id: string; bundle: IssueBuild }>;

  if (!builds[0]) return null;

  const existingDrafts = (await sql`
    SELECT id
    FROM drafts
    WHERE issue_build_id = ${builds[0].id}::uuid
    LIMIT 1
  `) as unknown as Array<{ id: string }>;

  let draftId = existingDrafts[0]?.id;
  if (!draftId) {
    const initial = createInitialDraft(builds[0].bundle);
    const inserted = (await sql`
      INSERT INTO drafts (id, issue_build_id, revision, status, state, updated_at)
      VALUES (
        ${initial.id}::uuid,
        ${builds[0].id}::uuid,
        ${initial.revision},
        ${initial.status},
        ${JSON.stringify(initial)}::jsonb,
        ${initial.updatedAt}::timestamptz
      )
      ON CONFLICT (issue_build_id) DO NOTHING
      RETURNING id
    `) as unknown as Array<{ id: string }>;

    draftId = inserted[0]?.id;
    if (!draftId) {
      const raced = (await sql`
        SELECT id FROM drafts WHERE issue_build_id = ${builds[0].id}::uuid LIMIT 1
      `) as unknown as Array<{ id: string }>;
      draftId = raced[0]?.id;
    }
  }

  return draftId ? loadWorkspaceByDraftId(sql, draftId) : null;
}

export async function loadEditorWorkspace(): Promise<EditorWorkspace> {
  const url = connectionString();
  if (!url) return demoWorkspace();

  try {
    const workspace = await loadLatestPostgresWorkspace(createSqlClient(url));
    return (
      workspace ??
      demoWorkspace(
        "PostgreSQL is connected but has no issue build. Load the fixture with npm run db:seed.",
      )
    );
  } catch {
    return demoWorkspace(
      "PostgreSQL could not be reached. The console is using its browser fixture and made no server writes.",
    );
  }
}

export async function applyPostgresCommand(
  draftId: string,
  expectedRevision: number,
  command: DraftCommand,
): Promise<CommandResult> {
  const url = connectionString();
  if (!url) throw new Error("PostgreSQL is not configured.");
  const sql = createSqlClient(url);

  const duplicate = (await sql`
    SELECT client_event_id
    FROM interaction_events
    WHERE client_event_id = ${command.clientEventId}::uuid
    LIMIT 1
  `) as unknown as Array<{ client_event_id: string }>;
  if (duplicate[0]) {
    const workspace = await loadWorkspaceByDraftId(sql, draftId);
    const event = workspace?.events.find(
      (item) => item.clientEventId === command.clientEventId,
    );
    if (workspace && event) return { draft: workspace.draft, event };
  }

  const rows = (await sql`
    SELECT d.revision, d.status, d.state, b.bundle
    FROM drafts d
    JOIN issue_builds b ON b.id = d.issue_build_id
    WHERE d.id = ${draftId}::uuid
    LIMIT 1
  `) as unknown as Array<{
    revision: number;
    status: DraftSnapshot["status"];
    state: DraftSnapshot;
    bundle: IssueBuild;
  }>;

  if (!rows[0]) throw new Error("Draft not found.");
  if (rows[0].revision !== expectedRevision) throw new StaleDraftError();

  const currentDraft = {
    ...rows[0].state,
    revision: rows[0].revision,
    status: rows[0].status,
  };
  const result = applyDraftCommand(rows[0].bundle, currentDraft, command);
  const persisted = (await sql`
    WITH updated AS (
      UPDATE drafts
      SET revision = ${result.draft.revision},
          state = ${JSON.stringify(result.draft)}::jsonb,
          updated_at = ${result.draft.updatedAt}::timestamptz
      WHERE id = ${draftId}::uuid
        AND revision = ${expectedRevision}
        AND status = 'draft'
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
): Promise<SubmitResult> {
  const url = connectionString();
  if (!url) throw new Error("PostgreSQL is not configured.");
  const sql = createSqlClient(url);
  const workspace = await loadWorkspaceByDraftId(sql, draftId);

  if (!workspace) throw new Error("Draft not found.");
  if (workspace.submission) {
    const submitEvent = workspace.events.find(
      (event) => event.clientEventId === clientEventId,
    );
    if (submitEvent) {
      return {
        draft: workspace.draft,
        event: submitEvent,
        submission: workspace.submission,
      };
    }
    throw new Error("This issue has already been submitted.");
  }
  if (workspace.draft.revision !== expectedRevision) throw new StaleDraftError();

  const submission = createSubmission(workspace, crypto.randomUUID(), occurredAt);
  const draft: DraftSnapshot = {
    ...workspace.draft,
    revision: expectedRevision + 1,
    status: "submitted",
    updatedAt: occurredAt,
  };
  const event: InteractionEvent = {
    clientEventId,
    type: "submit",
    draftRevision: draft.revision,
    occurredAt,
    incomplete: false,
    payload: {
      submissionId: submission.submissionId,
      trainingPairCount: submission.trainingPairs.length,
      incompleteEventCount: submission.incompleteEventCount,
    },
  };

  const persisted = (await sql`
    WITH updated AS (
      UPDATE drafts
      SET revision = ${draft.revision},
          status = 'submitted',
          state = ${JSON.stringify(draft)}::jsonb,
          updated_at = ${occurredAt}::timestamptz
      WHERE id = ${draftId}::uuid
        AND revision = ${expectedRevision}
        AND status = 'draft'
      RETURNING id, issue_build_id
    ), created_submission AS (
      INSERT INTO submissions (
        submission_id,
        draft_id,
        issue_build_id,
        draft_revision,
        snapshot,
        submitted_at
      )
      SELECT
        ${submission.submissionId}::uuid,
        id,
        issue_build_id,
        ${submission.draftRevision},
        ${JSON.stringify(submission)}::jsonb,
        ${occurredAt}::timestamptz
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
    SELECT id FROM created_submission
  `) as unknown as Array<{ id: string }>;

  if (!persisted[0]) throw new StaleDraftError();
  return { draft, event, submission };
}
