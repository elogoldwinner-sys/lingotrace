import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppTheme = "classic" | "kid";

/**
 * Kid mode is the default look. The key is versioned ("-v2") so browsers that
 * were saved as "classic" back when classic was the default (the old key was
 * written on every first visit) start in kid mode once; after that, whatever
 * the person picks with the Classic / Kid toggle is remembered as before.
 */
const STORAGE_KEY = "lingotrace-theme-v2";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "kid";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "classic" ? "classic" : "kid";
}

// Apply the saved theme before React's first paint so there is no flash of the
// other look while the app boots.
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", readStoredTheme());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function setTheme(next: AppTheme) {
    setThemeState(next);
  }

  function toggleTheme() {
    setThemeState((prev) => (prev === "kid" ? "classic" : "kid"));
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
