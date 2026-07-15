import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  CalendarCheck,
  NotebookPen,
  ClipboardList,
  Bell,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/classes", key: "classes", icon: BookOpen },
  { to: "/students", key: "students", icon: Users },
  { to: "/attendance", key: "attendance", icon: CalendarCheck },
  { to: "/sessions", key: "sessions", icon: ClipboardList },
  { to: "/notes", key: "notes", icon: NotebookPen },
  { to: "/notifications", key: "notifications", icon: Bell },
];

export default function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-navy text-cream-200">
      <div className="flex items-center gap-2 px-6 py-6">
        <span className="text-2xl">🍪</span>
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
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
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
    </aside>
  );
}
