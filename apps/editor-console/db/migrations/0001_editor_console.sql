CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE issue_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key text NOT NULL,
  issue_date date NOT NULL,
  build_version integer NOT NULL CHECK (build_version > 0),
  contract_version text NOT NULL,
  bundle_hash text NOT NULL,
  bundle jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_key, build_version),
  UNIQUE (bundle_hash)
);

CREATE TABLE drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_build_id uuid NOT NULL REFERENCES issue_builds(id),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_build_id)
);

CREATE TABLE interaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL UNIQUE,
  draft_id uuid NOT NULL REFERENCES drafts(id),
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  event_type text NOT NULL CHECK (
    event_type IN ('replace', 'undo', 'feedback', 'source_open', 'submit')
  ),
  payload jsonb NOT NULL,
  incomplete boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interaction_events_draft_order_idx
  ON interaction_events (draft_id, draft_revision, recorded_at);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE,
  draft_id uuid NOT NULL UNIQUE REFERENCES drafts(id),
  issue_build_id uuid NOT NULL REFERENCES issue_builds(id),
  draft_revision integer NOT NULL CHECK (draft_revision > 0),
  snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submission_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id),
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submission_receipts_submission_order_idx
  ON submission_receipts (submission_id, recorded_at);

CREATE OR REPLACE FUNCTION reject_immutable_console_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER issue_builds_are_immutable
  BEFORE UPDATE OR DELETE ON issue_builds
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_console_row_change();

CREATE TRIGGER interaction_events_are_append_only
  BEFORE UPDATE OR DELETE ON interaction_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_console_row_change();

CREATE TRIGGER submissions_are_immutable
  BEFORE UPDATE OR DELETE ON submissions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_console_row_change();

CREATE TRIGGER submission_receipts_are_append_only
  BEFORE UPDATE OR DELETE ON submission_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_console_row_change();
