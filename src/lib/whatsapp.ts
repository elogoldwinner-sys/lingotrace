/**
 * Builds a `wa.me` deep link from a phone number as it was typed (which may
 * include spaces, dashes, parentheses, a leading "+" or the international
 * "00" prefix). WhatsApp only accepts digits (country code + number) in the
 * URL — no "+", no punctuation and no leading zeros — so this strips all of
 * that.
 */
export function whatsappLink(rawNumber: string): string {
  const digitsOnly = rawNumber.replace(/[^\d]/g, "").replace(/^0+/, "");
  return `https://wa.me/${digitsOnly}`;
}

/**
 * Cleans a parent's WhatsApp number into the stored format `00<country code><number>`
 * (e.g. 00966501234567). Accepts "+966 50 123 4567", "00966-50-123-4567" and, as a
 * convenience for Saudi numbers, a local "050 123 4567". Returns null when it doesn't
 * look like a phone number (8–15 digits after the "00").
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  const hadPlus = value.startsWith("+");
  value = value.replace(/[^\d]/g, "");
  if (hadPlus) value = `00${value}`;
  else if (/^05\d{8}$/.test(value)) value = `00966${value.slice(1)}`;
  if (!/^00[1-9]\d{7,14}$/.test(value)) return null;
  return value;
}
