import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const DESKTOP_COLLAPSE_KEY = "lingotrace-sidebar-collapsed";

/**
 * Owns the sidebar's two independent open/closed states so the content
 * area's left padding can react to whichever one actually affects layout:
 *
 * - `desktopCollapsed` (persisted): at md+ widths the sidebar is always
 *   docked and pushes the content over, so this directly drives the
 *   content's padding — collapsed = icon rail, expanded = full width.
 * - `mobileOpen` (session-only, starts closed every visit): below md the
 *   sidebar is a fixed icon rail by default and only ever *overlays* the
 *   content when opened (see Sidebar.tsx), so it never affects padding —
 *   the content stays docked to the icon rail's width regardless.
 */
export default function AppLayout() {
  const [desktopCollapsed, setDesktopCollapsed] = useState(
    () => localStorage.getItem(DESKTOP_COLLAPSE_KEY) === "1"
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(DESKTOP_COLLAPSE_KEY, desktopCollapsed ? "1" : "0");
  }, [desktopCollapsed]);

  function handleToggle() {
    // Below md, the sidebar is an overlay drawer over an always-present
    // icon rail — toggling opens/closes that drawer. At md+, it's docked
    // and pushes content, so toggling collapses/expands it in place.
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((v) => !v);
    } else {
      setDesktopCollapsed((v) => !v);
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <Sidebar
        collapsed={desktopCollapsed}
        mobileOpen={mobileOpen}
        onToggle={handleToggle}
        onNavigate={() => setMobileOpen(false)}
      />
      <div
        className={`flex flex-col min-h-screen transition-[padding] duration-200 ps-14 ${
          desktopCollapsed ? "md:ps-16" : "md:ps-64"
        }`}
      >
        <Topbar />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
