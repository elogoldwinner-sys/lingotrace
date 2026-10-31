import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { isAdminEmail } from "../../lib/admin";
import { subscribeUnreadCount } from "../../lib/services/ticketsService";
import Spinner from "../../components/common/Spinner";

/** Shell of the admin portal: header + tabs. Only the admin Google account gets past it (the rules enforce it again). */
export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeUnreadCount("admin", null, setUnread);
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Spinner />
      </div>
    );
  }
  if (!user || !isAdmin) return <Navigate to="/admin-login" replace />;

  const tabs = [
    { to: "/admin", key: "overview", label: "Overview", end: true },
    { to: "/admin/schools", key: "schools", label: "Schools", end: false },
    { to: "/admin/tickets", key: "tickets", label: "Tickets", end: false },
  ];

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-cream-400 bg-cream-100/90 px-3 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-cream-100">
              <ShieldCheck size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-serif text-lg font-semibold text-navy">{t("adm.title", "Platform admin")}</p>
              <p className="truncate text-xs font-semibold text-cream-600" dir="ltr">
                {user.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")}
              className="flex items-center gap-1.5 rounded-lg border border-cream-400 bg-white px-3 py-1.5 text-xs font-semibold text-navy"
            >
              <Globe size={14} />
              {i18n.language === "ar" ? "EN" : "AR"}
            </button>
            <button
              onClick={async () => {
                await signOut();
                navigate("/admin-login");
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy/70 hover:bg-cream-400/60"
            >
              <LogOut size={14} />
              {t("nav.signOut")}
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-6xl flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                  isActive ? "bg-navy text-white shadow" : "bg-cream-300/50 text-navy hover:bg-cream-300"
                }`
              }
            >
              {t(`adm.tab.${tab.key}`, tab.label)}
              {tab.key === "tickets" && unread > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
