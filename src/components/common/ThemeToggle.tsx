import { useTranslation } from "react-i18next";
import { Sparkles, GraduationCap } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Lets anyone flip the whole app between the classic navy/gold look and the
 * bright, rounded "kid mode" skin. Persists via ThemeContext (localStorage),
 * so the choice sticks across the teacher dashboard, portal pages, and
 * reloads. Drop this into any header/topbar.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const isKid = theme === "kid";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isKid ? t("theme.switchToClassic") : t("theme.switchToKid")}
      aria-pressed={isKid}
      className={`flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy transition-all hover:bg-gold-50 ${
        isKid ? "border-2 shadow-[0_3px_0_rgb(var(--color-gold-200))] hover:-translate-y-0.5" : ""
      } ${className}`}
    >
      {isKid ? <GraduationCap size={14} /> : <Sparkles size={14} />}
      {isKid ? t("theme.classicMode") : t("theme.kidMode")}
    </button>
  );
}
