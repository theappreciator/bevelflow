-- One row each time a record's workflow state is set: at creation (from_state NULL)
-- and on every change. History starts from this migration; earlier changes weren't
-- recorded.
CREATE TABLE workflow_events (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES records (id) ON DELETE CASCADE,
  from_state  TEXT,
  to_state    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX workflow_events_record ON workflow_events (record_id, created_at DESC);
