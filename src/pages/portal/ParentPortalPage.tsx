import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe, MessageCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToStudent } from "../../lib/services/studentsService";
import { subscribeToStudentPointsHistory } from "../../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../../lib/services/attendanceService";
import { subscribeToVisibleParentNotes } from "../../lib/services/notesService";
import { getBadgeDefinition } from "../../lib/services/badgesService";
import { formatNoteDate } from "../../lib/timestamps";
import { whatsappLink } from "../../lib/whatsapp";
import Logo from "../../components/common/Logo";
import type {
  PointsTransaction,
  AttendanceRecord,
  AttendanceStatus,
  NoteRecord,
  StudentRecord,
} from "../../types";
import Spinner from "../../components/common/Spinner";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-gold-100 text-gold-700",
  excused: "bg-navy-100 text-navy",
};

/**
 * Live view of ONE child, used for whichever tab (studentId) is currently
 * selected. Kept as a separate component so switching tabs cleanly tears
 * down and re-subscribes listeners for just that child, instead of the
 * page juggling parallel listener sets for every child at once.
 */
function ChildPanel({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const [child, setChild] = useState<StudentRecord | null>(null);
  const [pointsHistory, setPointsHistory] = useState<PointsTransaction[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubChild = subscribeToStudent(studentId, (data) => {
      setChild(data);
      setLoading(false);
    });
    const unsubPoints = subscribeToStudentPointsHistory(studentId, setPointsHistory);
    const unsubAttendance = subscribeToStudentAttendance(studentId, setAttendance);
    const unsubNotes = subscribeToVisibleParentNotes(studentId, setNotes);
    return () => {
      unsubChild();
      unsubPoints();
      unsubAttendance();
      unsubNotes();
    };
  }, [studentId]);

  if (loading || !child) {
    return (
      <div className="py-16 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const contactHref = child.teacherWhatsapp ? whatsappLink(child.teacherWhatsapp) : null;

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <p className="label-eyebrow mb-1">{t("portal.parentWelcome")}</p>
        <h1 className="text-2xl font-semibold text-navy">{child.name}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-gold">{child.points}</span>
            <span className="text-sm text-cream-600">{t("students.points")}</span>
          </div>
          {contactHref && (
            <a
              href={contactHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary py-1.5 px-3 text-sm ms-auto"
            >
              <MessageCircle size={16} />
              {t("portal.contactWhatsapp")}
            </a>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">{t("students.badges")}</h2>
        {child.badgeIds.length === 0 ? (
          <p className="text-sm text-cream-600">{t("portal.noBadgesYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {child.badgeIds.map((badgeId) => {
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

      {notes.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">{t("notes.title")}</h2>
          <div className="space-y-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`rounded-lg border px-3 py-2.5 ${
                  note.sentiment === "positive"
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-red-300 bg-red-50 text-red-800"
                }`}
              >
                <p className="text-sm">{note.content}</p>
                {note.createdAt && (
                  <p className="text-xs mt-1 opacity-70">{formatNoteDate(note.createdAt, i18n.language)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">{t("portal.recentPoints")}</h2>
        {pointsHistory.length === 0 ? (
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
    </div>
  );
}

/** Tiny standalone piece just for a tab's label (child's name), kept live so a name edit reflects immediately. */
function ChildTabLabel({ studentId }: { studentId: string }) {
  const [name, setName] = useState("");
  useEffect(() => {
    const unsub = subscribeToStudent(studentId, (data) => setName(data?.name || ""));
    return unsub;
  }, [studentId]);
  return <>{name || "…"}</>;
}

export default function ParentPortalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { portalParent, signOut } = useAuth();
  const [activeStudentId, setActiveStudentId] = useState("");

  const studentIds = portalParent?.studentIds || [];

  useEffect(() => {
    if (studentIds.length > 0 && !studentIds.includes(activeStudentId)) {
      setActiveStudentId(studentIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalParent]);

  async function handleSignOut() {
    await signOut();
    navigate("/portal-login");
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  }

  if (!portalParent || !activeStudentId) {
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
          <Logo size={28} />
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
        {studentIds.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {studentIds.map((sid) => (
              <button
                key={sid}
                onClick={() => setActiveStudentId(sid)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  activeStudentId === sid
                    ? "border-gold bg-gold-50 text-navy"
                    : "border-cream-300 bg-white text-cream-600 hover:border-gold/50"
                }`}
              >
                <ChildTabLabel studentId={sid} />
              </button>
            ))}
          </div>
        )}

        <ChildPanel key={activeStudentId} studentId={activeStudentId} />
      </main>
    </div>
  );
}
