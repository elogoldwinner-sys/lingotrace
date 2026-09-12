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
  ChevronsLeft,
  ChevronsRight,
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

interface SidebarProps {
  /** md+ only: docked-and-pushes-content collapse state (persisted — see AppLayout). */
  collapsed: boolean;
  /** below md only: overlay-drawer open state (session-only — see AppLayout). */
  mobileOpen: boolean;
  onToggle: () => void;
  /** Closes the mobile drawer after a nav pick, so it doesn't stay open over the new page. */
  onNavigate: () => void;
}

/**
 * Below md, this is always visible as a narrow icon-only rail — there was
 * previously no navigation at all on phone-width screens, so this is a
 * genuine upgrade, not just a resize of what existed — and the toggle arrow
 * expands it into a full overlay drawer with labels that floats over the
 * page instead of pushing it (there's no horizontal room to spare on a
 * phone). At md+, it's docked and the same toggle instead collapses it in
 * place to an icon rail to reclaim horizontal space, matching AppLayout's
 * content padding.
 *
 * Both label text and the toggle icon's direction need to differ by
 * breakpoint independently (mobile cares about `mobileOpen`, desktop cares
 * about `collapsed`) — done by rendering both variants and showing only
 * one per breakpoint via Tailwind's `md:` classes, rather than trying to
 * pick a single JS value that can't know the current viewport width.
 */
export default function Sidebar({ collapsed, mobileOpen, onToggle, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isKid = theme === "kid";

  return (
    <>
      {/* Only ever rendered while the mobile drawer is open, to dim/close the page behind it; md:hidden keeps it from ever appearing at desktop widths even if mobileOpen were somehow still true there. */}
      {mobileOpen && (
        <div onClick={onToggle} className="fixed inset-0 z-30 bg-navy/40 md:hidden" aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 z-40 flex flex-col bg-navy text-cream-200 transition-all duration-200 ${
          mobileOpen ? "w-64 shadow-2xl" : "w-14"
        } ${collapsed ? "md:w-16" : "md:w-64"} ${
          isKid ? "rounded-r-[28px] shadow-[6px_0_24px_rgba(59,34,135,0.25)]" : ""
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-6 md:px-6">
          <Logo size={28} className={`shrink-0 ${isKid ? "drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]" : ""}`} />
          <span
            className={`font-serif text-xl font-semibold tracking-wide truncate ${
              mobileOpen ? "inline" : "hidden"
            } ${collapsed ? "md:hidden" : "md:inline"}`}
          >
            {t("app.name")}
          </span>
        </div>
        <div className="h-px bg-gold/30 mx-3 md:mx-6" />
        <nav className="flex-1 px-2 py-6 space-y-1 md:px-3 overflow-y-auto">
          {navItems.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={t(`nav.${key}`)}
              className={({ isActive }) =>
                isKid
                  ? `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all ease-bouncy duration-150 ${
                      mobileOpen ? "justify-start" : "justify-center"
                    } ${collapsed ? "md:justify-center" : "md:justify-start"} ${
                      isActive
                        ? "bg-gold text-navy shadow-[0_3px_0_rgb(var(--color-gold-800))] scale-[1.03]"
                        : "text-cream-200/80 hover:bg-white/10 hover:text-cream-100 hover:translate-x-0.5"
                    }`
                  : `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      mobileOpen ? "justify-start" : "justify-center"
                    } ${collapsed ? "md:justify-center" : "md:justify-start"} ${
                      isActive
                        ? "bg-gold/15 text-gold"
                        : "text-cream-200/80 hover:bg-white/5 hover:text-cream-100"
                    }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span
                className={`truncate ${mobileOpen ? "inline" : "hidden"} ${collapsed ? "md:hidden" : "md:inline"}`}
              >
                {t(`nav.${key}`)}
              </span>
            </NavLink>
          ))}
        </nav>
        {isKid && (
          <div
            className={`justify-center pb-4 opacity-90 ${mobileOpen ? "flex" : "hidden"} ${
              collapsed ? "md:hidden" : "md:flex"
            }`}
          >
            <StudyMascot size={64} />
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          title={t("nav.toggleSidebar")}
          className="absolute top-7 -end-3 h-6 w-6 flex items-center justify-center rounded-full bg-gold text-navy border-2 border-cream shadow-md hover:scale-110 transition-transform"
        >
          <span className="md:hidden">{mobileOpen ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}</span>
          <span className="hidden md:inline-flex">
            {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
          </span>
        </button>
      </aside>
    </>
  );
}
