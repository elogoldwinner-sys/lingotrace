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

/**
 * Like normalizeWhatsappNumber, but forgiving about what a spreadsheet does to phone numbers: Excel turns a number typed
 * as 966501234567 into a plain number (no "+", no "00") and drops the leading 0 of 0501234567, so those shapes are
 * recognised too. Returns null when the cell doesn't look like a phone number.
 */
export function normalizeImportedWhatsapp(raw: string): string | null {
  const direct = normalizeWhatsappNumber(raw);
  if (direct) return direct;
  const digits = raw.replace(/[^\d]/g, "");
  if (/^5\d{8}$/.test(digits)) return `00966${digits}`; // 05xxxxxxxx that lost its 0
  if (/^[1-9]\d{9,14}$/.test(digits)) return `00${digits}`; // 966501234567 typed without + or 00
  return null;
}
