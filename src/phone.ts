/**
 * Display format for phone numbers. Only numbers made of digits plus spaces, dashes,
 * dots, parentheses and an optional leading "+" are reformatted; anything else
 * (extensions, letters, other lengths) is shown exactly as typed.
 *
 *   10 digits                   -> (999) 999-9999
 *   11 digits starting with 1   -> drop the 1, then (999) 999-9999
 *   11 digits, other first digit -> +9 (999) 999-9999
 */
export function formatPhone(phone: string): string {
  const trimmed = phone.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return phone;
  const digits = trimmed.replace(/\D/g, "");
  const local = (d: string): string => `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (digits.length === 10) return local(digits);
  if (digits.length === 11) {
    return digits.startsWith("1") ? local(digits.slice(1)) : `+${digits[0]} ${local(digits.slice(1))}`;
  }
  return phone;
}

/** tel: link for a typed phone number. "555 1234 x9" -> "tel:5551234,9" (pause, then extension). */
export function telHref(phone: string): string {
  const dialable = phone
    .trim()
    .replace(/\s*(?:x|ext\.?|extension)\s*/i, ",")
    .replace(/[^\d+*#,;]/g, "");
  return `tel:${dialable}`;
}
