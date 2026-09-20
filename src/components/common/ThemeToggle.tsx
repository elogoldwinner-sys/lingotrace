import { useTranslation } from "react-i18next";
import { Sparkles, GraduationCap } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Lets anyone flip the whole app between the classic navy/gold look and the
 * bright, rounded "kid mode" skin. Persists via ThemeContext (localStorage),
 * so the choice sticks across the teacher dashboard, portal pages, and
 * reloads. Drop this into any header/topbar.
 *
 * `variant="pill"` is the white, fully-rounded "Classic mode" button used on
 * the kid-mode homepage; the default variant is used everywhere else.
 */
export default function ThemeToggle({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "pill";
}) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const isKid = theme === "kid";

  const look =
    variant === "pill"
      ? "gap-2 rounded-full border-2 border-gold-300 bg-white px-4 py-2 text-sm font-extrabold text-navy-700 shadow-[0_8px_18px_-8px_rgba(255,152,0,0.65)] ease-bouncy hover:-translate-y-0.5 sm:px-5 sm:py-2.5 sm:text-base"
      : `gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50 ${
          isKid ? "border-2 shadow-[0_3px_0_rgb(var(--color-gold-200))] hover:-translate-y-0.5" : ""
        }`;
  const iconSize = variant === "pill" ? 18 : 14;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isKid ? t("theme.switchToClassic") : t("theme.switchToKid")}
      aria-pressed={isKid}
      className={`flex items-center transition-all ${look} ${className}`}
    >
      {isKid ? <GraduationCap size={iconSize} /> : <Sparkles size={iconSize} />}
      {isKid ? t("theme.classicMode") : t("theme.kidMode")}
    </button>
  );
}
