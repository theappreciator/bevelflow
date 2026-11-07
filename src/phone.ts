/**
 * Phone numbers are stored exactly as typed. For display, a number made of exactly
 * 10 digits (ignoring spaces, dashes, dots and parentheses) is shown as (999) 999-9999;
 * anything else is shown as-is.
 */
export function formatPhone(phone: string): string {
  const trimmed = phone.trim();
  if (!/^[\d\s().-]+$/.test(trimmed)) return phone;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** tel: link for a typed phone number. "555 1234 x9" -> "tel:5551234,9" (pause, then extension). */
export function telHref(phone: string): string {
  const dialable = phone
    .trim()
    .replace(/\s*(?:x|ext\.?|extension)\s*/i, ",")
    .replace(/[^\d+*#,;]/g, "");
  return `tel:${dialable}`;
}
