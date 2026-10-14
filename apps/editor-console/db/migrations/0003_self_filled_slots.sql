ALTER TABLE interaction_events
  DROP CONSTRAINT IF EXISTS interaction_events_event_type_check;

ALTER TABLE interaction_events
  ADD CONSTRAINT interaction_events_event_type_check CHECK (
    event_type IN ('replace', 'undo', 'feedback', 'source_open', 'self_fill', 'submit', 'reopen')
  );
