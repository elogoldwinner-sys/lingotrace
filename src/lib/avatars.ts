/**
 * The built-in cartoon avatar collection (public/avatars): 32 boys + 32 girls.
 * A student's picture is stored as the avatar's URL in `photoURL`, so every
 * place that already shows `photoURL` keeps working unchanged.
 */
export type AvatarGender = "boys" | "girls" | "mixed";
export type AvatarGroup = "boys" | "girls";

export const AVATARS_PER_GROUP = 32;

function url(group: AvatarGroup, n: number) {
  return `${import.meta.env.BASE_URL}avatars/${group}-${String(n).padStart(2, "0")}.webp`;
}

function group(g: AvatarGroup): string[] {
  return Array.from({ length: AVATARS_PER_GROUP }, (_, i) => url(g, i + 1));
}

/** All avatar URLs a class of this type may use (mixed = boys + girls). */
export function avatarPool(gender: AvatarGender): string[] {
  if (gender === "boys") return group("boys");
  if (gender === "girls") return group("girls");
  return [...group("boys"), ...group("girls")];
}

/** The file name (e.g. "boys-05.webp") — used to compare avatars regardless of the site's base path. */
export function avatarKey(photoURL?: string | null): string | null {
  const m = photoURL?.match(/avatars\/((?:boys|girls)-\d+\.webp)$/);
  return m ? m[1] : null;
}

export function takenKeys(students: { photoURL?: string }[], exceptPhoto?: string): Set<string> {
  const own = avatarKey(exceptPhoto);
  const set = new Set<string>();
  for (const s of students) {
    const k = avatarKey(s.photoURL);
    if (k && k !== own) set.add(k);
  }
  return set;
}

export function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
