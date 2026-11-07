/**
 * Public record IDs: 8 characters from 0-9 and A-Z, minus the look-alike letters
 * O L I S Z B (30 characters, ~656 billion combinations). Stored without a dash
 * ("K7MX4QPA"), shown as "K7MX-4QPA".
 *
 * migrations/0003_public_id.sql repeats this alphabet for backfilling; keep them in sync.
 */
export const PUBLIC_ID_ALPHABET = "0123456789ACDEFGHJKMNPQRTUVWXY";
export const PUBLIC_ID_LENGTH = 8;

/** Random public ID using the platform's secure random generator, with no bias. */
export function generatePublicId(): string {
  const n = PUBLIC_ID_ALPHABET.length;
  const limit = 256 - (256 % n); // reject bytes >= limit so every character is equally likely
  let id = "";
  while (id.length < PUBLIC_ID_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit) id += PUBLIC_ID_ALPHABET[byte % n];
      if (id.length === PUBLIC_ID_LENGTH) break;
    }
  }
  return id;
}

/** "k7mx-4qpa", "K7MX 4QPA" -> "K7MX4QPA"; null if it can't be a public ID. */
export function normalizePublicId(input: string): string | null {
  const id = input.toUpperCase().replace(/[\s-]/g, "");
  return id.length === PUBLIC_ID_LENGTH && [...id].every((c) => PUBLIC_ID_ALPHABET.includes(c)) ? id : null;
}

/** Path of the QR-code link for a record. /q/ is a redirect we control (functions/q/[publicId].ts). */
export function qrPath(publicId: string): string {
  return `/q/${publicId}`;
}

/** "K7MX4QPA" -> "K7MX-4QPA" */
export function formatPublicId(id: string): string {
  return id.length === PUBLIC_ID_LENGTH ? `${id.slice(0, 4)}-${id.slice(4)}` : id;
}
