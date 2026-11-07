-- Estimated cost is now stored in cents (25.12 -> 2512) and shown as dollars.cents.
-- Existing values were whole dollars, so convert them to keep the same amount.
ALTER TABLE records RENAME COLUMN estimated_cost TO estimated_cost_cents;
UPDATE records SET estimated_cost_cents = estimated_cost_cents * 100 WHERE estimated_cost_cents IS NOT NULL;
