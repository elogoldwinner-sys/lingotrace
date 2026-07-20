/**
 * Builds a `wa.me` deep link from a phone number as the teacher typed it
 * (which may include spaces, dashes, parentheses, or a leading "+"). WhatsApp
 * only accepts digits (country code + number, no "+" or punctuation) in the
 * URL, so this strips everything else.
 */
export function whatsappLink(rawNumber: string): string {
  const digitsOnly = rawNumber.replace(/[^\d]/g, "");
  return `https://wa.me/${digitsOnly}`;
}
