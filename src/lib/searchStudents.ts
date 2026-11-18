/**
 * Name search for rosters, tolerant of how names are typed: case, Arabic diacritics and tatweel, the different forms of
 * alef / ya / ta-marbuta / waw-hamza, and extra spaces never get in the way. Every word typed must appear in the
 * student's English name, Arabic name or stored name, in any order.
 */
const COMBINING = /[\u064B-\u065F\u0670\u0640\u0300-\u036F]/g;

export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // آ أ إ ٱ → ا
    .replace(/\u0649|\u0626/g, "\u064A") // ى ئ → ي
    .replace(/\u0629/g, "\u0647") // ة → ه
    .replace(/\u0624/g, "\u0648") // ؤ → و
    .replace(/\s+/g, " ")
    .trim();
}

export function filterStudentsByQuery<T extends { name: string; nameAr?: string; nameEn?: string }>(students: T[], query: string): T[] {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return students;
  return students.filter((s) => {
    const haystack = normalizeSearch([s.name, s.nameAr, s.nameEn].filter(Boolean).join(" "));
    return tokens.every((tok) => haystack.includes(tok));
  });
}
