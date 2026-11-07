-- Backfill a "Created as …" workflow-history entry for records created before
-- workflow history existed (migration 0005).
--
-- The creation state used is the best information available:
--   * if the record has recorded changes, the state before its first change;
--   * otherwise its current state.
-- Changes made before history began weren't recorded, so for a record that changed
-- state back then, this shows the state at the start of history.
INSERT INTO workflow_events (id, record_id, from_state, to_state, created_at, created_by)
SELECT
  lower(hex(randomblob(16))),
  r.id,
  NULL,
  COALESCE(
    (SELECT w.from_state FROM workflow_events w
      WHERE w.record_id = r.id AND w.from_state IS NOT NULL
      ORDER BY w.created_at LIMIT 1),
    r.workflow_state
  ),
  r.created_at,
  r.created_by
FROM records r
WHERE NOT EXISTS (
  SELECT 1 FROM workflow_events w WHERE w.record_id = r.id AND w.from_state IS NULL
);
