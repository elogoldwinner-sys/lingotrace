import type { StudentRecord } from "../types";

type NameSource = Pick<StudentRecord, "name" | "nameAr" | "nameEn">;

/** True when the app language is Arabic (handles "ar", "ar-SA", ...). */
export function isArabicLang(lang?: string): boolean {
  return (lang || "").toLowerCase().startsWith("ar");
}

/**
 * The name to show for a student in the language the user is using:
 * Arabic UI → Arabic name, English UI → English name. Falls back to the
 * other name, then to the legacy `name` field (e.g. students who joined
 * with a Google account and have no Arabic/English name yet).
 */
export function studentDisplayName(student: NameSource | null | undefined, lang?: string): string {
  if (!student) return "";
  const ar = student.nameAr?.trim();
  const en = student.nameEn?.trim();
  const main = (student.name || "").trim();
  return (isArabicLang(lang) ? ar || en || main : en || ar || main) || "";
}

/** `name` is the stored primary name (used for sorting/matching): the English name, else the Arabic one. */
export function primaryName(nameEn?: string, nameAr?: string): string {
  return (nameEn || "").trim() || (nameAr || "").trim();
}
