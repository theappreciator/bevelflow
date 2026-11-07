/**
 * Money is stored as whole cents (25.12 -> 2512) and shown as dollars.cents.
 * String math only, so there are no floating-point rounding surprises.
 */

/** "25.12", "$1,200", "30", ".5" -> cents. "" -> null. Anything else -> "invalid". */
export function parseDollarsToCents(input: string): number | null | "invalid" {
  const raw = input.replace(/[\s,$]/g, "");
  if (raw === "") return null;
  const m = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!m || (m[2] === "" && !m[3])) return "invalid";
  const cents = Number(m[2] || "0") * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return "invalid";
  return m[1] && cents !== 0 ? -cents : cents;
}

/** 2512 -> "25.12", 3000 -> "30.00", -5 -> "-0.05". */
export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
