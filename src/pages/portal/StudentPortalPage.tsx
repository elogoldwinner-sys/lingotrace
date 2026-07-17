import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToStudentPointsHistory } from "../../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../../lib/services/attendanceService";
import { getBadgeDefinition } from "../../lib/services/badgesService";
import type { PointsTransaction, AttendanceRecord, AttendanceStatus } from "../../types";
import Spinner from "../../components/common/Spinner";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-gold-100 text-gold-700",
  excused: "bg-navy-100 text-navy",
};

export default function StudentPortalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { portalStudent, signOut } = useAuth();
  const [pointsHistory, setPointsHistory] = useState<PointsTransaction[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!portalStudent) return;
    const unsubPoints = subscribeToStudentPointsHistory(portalStudent.id, (data) => {
      setPointsHistory(data);
      setLoading(false);
    });
    const unsubAttendance = subscribeToStudentAttendance(portalStudent.id, setAttendance);
    return () => {
      unsubPoints();
      unsubAttendance();
    };
  }, [portalStudent]);

  async function handleSignOut() {
    await signOut();
    navigate("/portal-login");
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  }

  if (!portalStudent) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="flex items-center justify-between border-b border-cream-400 bg-cream-100/90 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍪</span>
          <span className="font-serif text-xl font-semibold text-navy">{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-gold-50"
          >
            <Globe size={14} />
            {i18n.language === "ar" ? "EN" : "AR"}
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy/70 hover:bg-cream-400/60"
          >
            <LogOut size={14} />
            {t("nav.signOut")}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="card p-6">
          <p className="label-eyebrow mb-1">{t("portal.welcome")}</p>
          <h1 className="text-2xl font-semibold text-navy">{portalStudent.name}</h1>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-3xl font-bold text-gold">{portalStudent.points}</span>
            <span className="text-sm text-cream-600">{t("students.points")}</span>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("students.badges")}</h2>
          {portalStudent.badgeIds.length === 0 ? (
            <p className="text-sm text-cream-600">{t("portal.noBadgesYet")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {portalStudent.badgeIds.map((badgeId) => {
                const badge = getBadgeDefinition(badgeId);
                if (!badge) return null;
                return (
                  <div
                    key={badgeId}
                    className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold-50 px-3 py-2"
                    title={badge.description}
                  >
                    <span className="text-xl">{badge.icon}</span>
                    <span className="text-sm font-medium text-navy">{badge.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("portal.recentPoints")}</h2>
          {loading ? (
            <Spinner />
          ) : pointsHistory.length === 0 ? (
            <p className="text-sm text-cream-600">{t("portal.noPointsYet")}</p>
          ) : (
            <div className="divide-y divide-cream-400">
              {pointsHistory.slice(0, 10).map((txn) => (
                <div key={txn.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-navy">{t(`points.reasons.${txn.reason}`)}</p>
                    {txn.note && <p className="text-xs text-cream-600">{txn.note}</p>}
                  </div>
                  <span className={`font-semibold ${txn.amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {txn.amount >= 0 ? "+" : ""}
                    {txn.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("attendance.title")}</h2>
          {attendance.length === 0 ? (
            <p className="text-sm text-cream-600">{t("portal.noAttendanceYet")}</p>
          ) : (
            <div className="divide-y divide-cream-400">
              {attendance.slice(0, 10).map((record) => (
                <div key={record.id} className="flex items-center justify-between py-3">
                  <span className="text-sm text-navy">{record.date}</span>
                  <span className={`pill ${STATUS_STYLES[record.status]}`}>
                    {t(`attendance.${record.status}`)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
