-- Soft delete: a deleted record is hidden from the main list but kept (and restorable)
-- until it is hard-deleted on the Admin page or purged. Shown as the status "Deleted".
-- (A separate column rather than a new workflow_state value: changing that column's
-- CHECK constraint would mean rebuilding the records table.)
ALTER TABLE records ADD COLUMN deleted_at INTEGER;
ALTER TABLE records ADD COLUMN deleted_by TEXT NOT NULL DEFAULT '';
