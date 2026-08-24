import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Logo from "../common/Logo";
import { useTheme } from "../../contexts/ThemeContext";
import { StudyMascot } from "../common/decorations";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  CalendarCheck,
  NotebookPen,
  ClipboardList,
  FolderCheck,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/classes", key: "classes", icon: BookOpen },
  { to: "/students", key: "students", icon: Users },
  { to: "/attendance", key: "attendance", icon: CalendarCheck },
  { to: "/sessions", key: "sessions", icon: ClipboardList },
  { to: "/notes", key: "notes", icon: NotebookPen },
  { to: "/projects", key: "projects", icon: FolderCheck },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isKid = theme === "kid";

  return (
    <aside
      className={`hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-navy text-cream-200 transition-colors duration-300 ${
        isKid ? "rounded-r-[28px] shadow-[6px_0_24px_rgba(59,34,135,0.25)]" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-6 py-6">
        <Logo size={28} className={isKid ? "drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]" : ""} />
        <span className="font-serif text-xl font-semibold tracking-wide">
          {t("app.name")}
        </span>
      </div>
      <div className="h-px bg-gold/30 mx-6" />
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map(({ to, key, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isKid
                ? `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all ease-bouncy duration-150 ${
                    isActive
                      ? "bg-gold text-navy shadow-[0_3px_0_rgb(var(--color-gold-800))] scale-[1.03]"
                      : "text-cream-200/80 hover:bg-white/10 hover:text-cream-100 hover:translate-x-0.5"
                  }`
                : `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gold/15 text-gold"
                      : "text-cream-200/80 hover:bg-white/5 hover:text-cream-100"
                  }`
            }
          >
            <Icon size={18} />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      {isKid && (
        <div className="flex justify-center pb-4 opacity-90">
          <StudyMascot size={64} />
        </div>
      )}
    </aside>
  );
}
