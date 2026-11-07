-- One row each time someone taps the Email or Call button for a record.
-- `target` is the email address / phone number as it was at that moment.
CREATE TABLE contact_events (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES records (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('email', 'call')),
  target      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX contact_events_record ON contact_events (record_id, created_at DESC);
