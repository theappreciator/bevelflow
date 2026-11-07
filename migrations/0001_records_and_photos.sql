-- Records: typed-in information. Timestamps are milliseconds since epoch (UTC).
CREATE TABLE records (
  id              TEXT PRIMARY KEY,
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  estimated_cost  INTEGER,
  workflow_state  TEXT NOT NULL DEFAULT 'new'
    CHECK (workflow_state IN (
      'new', 'in_progress', 'blocked_on_response', 'completed',
      'returned_paid', 'returned_not_paid'
    )),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  created_by      TEXT NOT NULL DEFAULT '',
  updated_by      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX records_created_at ON records (created_at DESC);

-- Photos: one row per stored JPEG in R2 (key = r2_key). Max 5 per record,
-- enforced by the API.
CREATE TABLE photos (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES records (id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX photos_record_id ON photos (record_id, created_at);
