import { Timestamp } from "firebase/firestore";

/**
 * Normalizes a `createdAt`-style field to epoch milliseconds. Every doc
 * written via `createFirestoreService().create()` gets `createdAt:
 * serverTimestamp()`, which reads back as a Firestore `Timestamp` object —
 * not the plain `number` our TS types optimistically declare. Anything that
 * does date-range filtering or arithmetic on `createdAt` should go through
 * this first.
 */
export function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "seconds" in (value as Record<string, unknown>)) {
    const seconds = (value as { seconds: number }).seconds;
    return seconds * 1000;
  }
  return 0;
}

/**
 * Formats a `createdAt`-style value as a short localized date (e.g. "Jul 20,
 * 2026" in English, or the Arabic equivalent). Returns an empty string for a
 * still-pending write (millis === 0) so the UI doesn't flash "Jan 1, 1970".
 */
export function formatNoteDate(value: unknown, locale: string): string {
  const millis = toMillis(value);
  if (!millis) return "";
  return new Date(millis).toLocaleDateString(locale === "ar" ? "ar" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
