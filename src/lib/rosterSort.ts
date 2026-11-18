import { useCallback, useState } from "react";

const KEY = "lingotrace-roster-alpha";

/**
 * Alphabetical order for class rosters (sessions and attendance), remembered on this device so the teacher's choice
 * sticks between sessions. Off = the class's own order.
 */
export function useRosterSort() {
  const [alpha, setAlphaState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const setAlpha = useCallback((on: boolean) => {
    setAlphaState(on);
    try {
      if (on) localStorage.setItem(KEY, "1");
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable — the choice just won't be remembered */
    }
  }, []);
  return { alpha, setAlpha };
}

/** A copy sorted by the name shown on the roster, in the app language's alphabet (Arabic or English), digits naturally. */
export function sortByName<T extends { name: string }>(students: T[], lang?: string): T[] {
  const collator = new Intl.Collator(lang || undefined, { sensitivity: "base", numeric: true });
  return [...students].sort((a, b) => collator.compare(a.name, b.name));
}
