ALTER TABLE drafts
  DROP CONSTRAINT IF EXISTS drafts_issue_build_id_key;

ALTER TABLE drafts
  ADD COLUMN issue_revision integer,
  ADD COLUMN editor_id text,
  ADD COLUMN is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN reopened_from_submission_id uuid;

UPDATE drafts
SET issue_revision = 1,
    editor_id = 'legacy-editor'
WHERE issue_revision IS NULL OR editor_id IS NULL;

ALTER TABLE drafts
  ALTER COLUMN issue_revision SET NOT NULL,
  ALTER COLUMN editor_id SET NOT NULL,
  ADD CONSTRAINT drafts_issue_revision_positive CHECK (issue_revision > 0),
  ADD CONSTRAINT drafts_issue_revision_unique UNIQUE (issue_build_id, issue_revision),
  ADD CONSTRAINT drafts_editable_is_current CHECK (status <> 'draft' OR is_current);

CREATE UNIQUE INDEX drafts_one_current_revision_per_build_idx
  ON drafts (issue_build_id)
  WHERE is_current;

CREATE UNIQUE INDEX drafts_one_editable_revision_per_build_idx
  ON drafts (issue_build_id)
  WHERE status = 'draft';

ALTER TABLE interaction_events
  DROP CONSTRAINT IF EXISTS interaction_events_draft_revision_check,
  DROP CONSTRAINT IF EXISTS interaction_events_event_type_check;

ALTER TABLE interaction_events
  ADD CONSTRAINT interaction_events_draft_revision_check CHECK (draft_revision >= 0),
  ADD CONSTRAINT interaction_events_event_type_check CHECK (
    event_type IN ('replace', 'undo', 'feedback', 'source_open', 'submit', 'reopen')
  );

DROP TRIGGER IF EXISTS submissions_are_immutable ON submissions;

ALTER TABLE submissions
  ADD COLUMN issue_key text,
  ADD COLUMN build_version integer,
  ADD COLUMN issue_revision integer,
  ADD COLUMN editor_id text,
  ADD COLUMN submit_client_event_id uuid;

UPDATE submissions AS submission
SET issue_key = build.issue_key,
    build_version = build.build_version,
    issue_revision = draft.issue_revision,
    editor_id = draft.editor_id,
    submit_client_event_id = COALESCE(
      (
        SELECT event.client_event_id
        FROM interaction_events AS event
        WHERE event.draft_id = submission.draft_id
          AND event.event_type = 'submit'
        ORDER BY event.recorded_at DESC
        LIMIT 1
      ),
      gen_random_uuid()
    )
FROM issue_builds AS build, drafts AS draft
WHERE submission.issue_build_id = build.id
  AND submission.draft_id = draft.id;

ALTER TABLE submissions
  ALTER COLUMN issue_key SET NOT NULL,
  ALTER COLUMN build_version SET NOT NULL,
  ALTER COLUMN issue_revision SET NOT NULL,
  ALTER COLUMN editor_id SET NOT NULL,
  ALTER COLUMN submit_client_event_id SET NOT NULL,
  ADD CONSTRAINT submissions_build_version_positive CHECK (build_version > 0),
  ADD CONSTRAINT submissions_issue_revision_positive CHECK (issue_revision > 0),
  ADD CONSTRAINT submissions_issue_revision_unique UNIQUE (issue_build_id, issue_revision),
  ADD CONSTRAINT submissions_submit_client_event_unique UNIQUE (submit_client_event_id);

ALTER TABLE drafts
  ADD CONSTRAINT drafts_reopened_from_submission_fk
  FOREIGN KEY (reopened_from_submission_id) REFERENCES submissions(submission_id);

CREATE INDEX submissions_build_revision_order_idx
  ON submissions (issue_build_id, issue_revision);

CREATE TRIGGER submissions_are_immutable
  BEFORE UPDATE OR DELETE ON submissions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_console_row_change();
