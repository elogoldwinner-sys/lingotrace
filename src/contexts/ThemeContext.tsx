import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppTheme = "classic" | "kid";

const STORAGE_KEY = "lingotrace-theme";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "classic";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "kid" ? "kid" : "classic";
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
