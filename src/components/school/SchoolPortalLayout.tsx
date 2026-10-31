import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, LogOut, Repeat, Building2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSchool } from "../../contexts/SchoolContext";
import Spinner from "../common/Spinner";
import { SchoolDataProvider } from "./SchoolDataContext";
import type { StaffRole } from "../../types";

const TABS: { to: string; key: string; label: string; roles: StaffRole[] }[] = [
  { to: "/school", key: "overview", label: "Overview", roles: ["principal", "departmentHead", "counselor", "supervisor", "coordinator"] },
  { to: "/school/reports", key: "reports", label: "Reports", roles: ["principal", "departmentHead", "counselor", "supervisor", "coordinator"] },
  { to: "/school/compare", key: "compare", label: "Compare", roles: ["principal", "departmentHead", "counselor", "supervisor", "coordinator"] },
  { to: "/school/feedback", key: "feedback", label: "Feedback", roles: ["principal", "departmentHead", "supervisor", "coordinator"] },
  { to: "/school/teachers", key: "teachers", label: "Teachers", roles: ["principal", "departmentHead"] },
  { to: "/school/staff", key: "staff", label: "Staff", roles: ["principal", "departmentHead"] },
  { to: "/school/audit", key: "audit", label: "Audit trail", roles: ["principal"] },
  { to: "/school/settings", key: "settings", label: "Settings", roles: ["principal"] },
];

/** Shell of the principal / department head / counselor portal: school header + role-based tabs. */
export default function SchoolPortalLayout() {
  const { t, i18n } = useTranslation();
  const { user, profile, portalParent, portalStudent, signOut, loading: authLoading } = useAuth();
  const { staff, school, loading } = useSchool();
  const navigate = useNavigate();

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Spinner />
      </div>
    );
  }
  if (!user || !staff || !school) return <Navigate to="/school-login" replace />;

  const tabs = TABS.filter((x) => x.roles.includes(staff.role));
  const roleText = staff.jobTitle || t(`sp.role.${staff.role}`, staff.role);

  return (
    <SchoolDataProvider>
      <div className="min-h-screen bg-cream">
        <header className="border-b border-cream-400 bg-cream-100/90 px-3 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {school.logoURL ? (
                <img src={school.logoURL} alt="" className="h-11 w-11 shrink-0 rounded-full border border-gold/40 bg-white object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy text-cream-100">
                  <Building2 size={20} />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-serif text-lg font-semibold text-navy">{school.name}</p>
                <p className="truncate text-xs font-semibold text-cream-600">
                  {roleText}
                  {staff.subject ? ` · ${staff.subject}` : ""} · {profile?.displayName || user.displayName || user.email}
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
              {/* Role switcher: the same Google account can also be a teacher / parent / student. */}
              {profile && (
                <button
                  onClick={() => navigate("/dashboard")}
                  className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
                >
                  <Repeat size={14} />
                  {t("sp.switchTeacher", "Teacher portal")}
                </button>
              )}
              {portalParent && (
                <button
                  onClick={() => navigate("/portal/parent")}
                  className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
                >
                  <Repeat size={14} />
                  {t("nav.switchToParentPortal")}
                </button>
              )}
              {!portalParent && portalStudent && (
                <button
                  onClick={() => navigate("/portal/student")}
                  className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
                >
                  <Repeat size={14} />
                  {t("nav.switchToStudentPortal")}
                </button>
              )}
              <button
                onClick={async () => {
                  await signOut();
                  navigate("/school-login");
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
                end={tab.to === "/school"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                    isActive ? "bg-navy text-white shadow" : "bg-cream-300/50 text-navy hover:bg-cream-300"
                  }`
                }
              >
                {t(`sp.tab.${tab.key}`, tab.label)}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </SchoolDataProvider>
  );
}
