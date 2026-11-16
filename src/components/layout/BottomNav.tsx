import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, Minimize2 } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useFeature } from "../../contexts/SchoolContext";
import { useFullscreenMode } from "../../lib/fullscreen";
import { navItems } from "./Sidebar";

/** Full-screen mode: the sidebar's links as a sticky bottom bar, so the page gets the sidebar's width back. */
export default function BottomNav() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isKid = theme === "kid";
  const examsOn = useFeature("examsGames");
  const { exit } = useFullscreenMode();

  const item = "flex w-[4.4rem] shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold leading-tight transition";
  const idle = isKid ? "text-white/85 hover:bg-white/10 hover:text-white" : "text-cream-200/80 hover:bg-white/5 hover:text-cream-100";
  const active = isKid ? "bg-gradient-to-b from-[#FFCB45] to-[#FFB020] text-navy-800 shadow-[0_3px_0_#C98A0B]" : "bg-gold/15 text-gold";

  return (
    <nav
      aria-label={t("nav.toggleSidebar")}
      className={`fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] print:hidden ${
        isKid ? "border-white/10 bg-[#36207C] shadow-[0_-8px_24px_-12px_rgba(54,32,124,0.55)]" : "border-gold/30 bg-navy"
      }`}
    >
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="mx-auto flex w-max items-stretch gap-1 px-2 py-1.5">
          {navItems.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              {key === "linkedActivities" && !examsOn ? (
                <div
                  aria-disabled="true"
                  title={t("feat.lockedTeacher", "Not enabled for your school. Ask your principal to request it.")}
                  className={`${item} ${idle} cursor-not-allowed opacity-45`}
                >
                  <span className="relative">
                    <Icon size={22} strokeWidth={2.2} />
                    <Lock size={10} className="absolute -end-2 -top-1" />
                  </span>
                  <span className="w-full truncate text-center">{t(`nav.${key}`)}</span>
                </div>
              ) : (
                <NavLink to={to} title={t(`nav.${key}`)} className={({ isActive }) => `${item} ${isActive ? active : idle}`}>
                  <Icon size={22} strokeWidth={2.2} />
                  <span className="w-full truncate text-center">{t(`nav.${key}`)}</span>
                </NavLink>
              )}
            </li>
          ))}
          <li>
            <button type="button" onClick={() => void exit()} className={`${item} ${idle}`} title={t("nav.exitFullscreen", "Exit full screen")}>
              <Minimize2 size={22} strokeWidth={2.2} />
              <span className="w-full truncate text-center">{t("nav.exitFullscreen", "Exit full screen")}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
