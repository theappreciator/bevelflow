-- Public record ID: 8 characters from 0-9 A-Z excluding O L I S Z B
-- (alphabet must match shared/publicId.ts). New records get one from the API;
-- this backfills existing records.
ALTER TABLE records ADD COLUMN public_id TEXT;

UPDATE records SET public_id =
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1) ||
  substr('0123456789ACDEFGHJKMNPQRTUVWXY', abs(random()) % 30 + 1, 1)
WHERE public_id IS NULL;

CREATE UNIQUE INDEX records_public_id ON records (public_id);
