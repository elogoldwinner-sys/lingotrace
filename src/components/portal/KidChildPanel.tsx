import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, NotebookPen, Star, CalendarDays, User } from "lucide-react";
import { subscribeToStudent } from "../../lib/services/studentsService";
import { subscribeToStudentPointsHistory } from "../../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../../lib/services/attendanceService";
import { subscribeToVisibleParentNotes } from "../../lib/services/notesService";
import { getBadgeDefinition } from "../../lib/services/badgesService";
import { formatNoteDate } from "../../lib/timestamps";
import RichText from "../common/RichText";
import { Star as StarDecor } from "../home/KidHomeArt";
import type { PointsTransaction, AttendanceRecord, AttendanceStatus, NoteRecord, StudentRecord } from "../../types";
import Spinner from "../common/Spinner";

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-50 text-green-700",
  absent: "bg-red-50 text-red-700",
  late: "bg-gold-50 text-gold-700",
  excused: "bg-navy-50 text-navy-700",
};

/** Small header row shared by every card below: icon chip + bold title, with a tiny star accent like the reference. */
function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="relative mb-4 flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50 text-navy-600">{icon}</span>
      <h2 className="text-lg font-extrabold text-navy-700">{title}</h2>
      <StarDecor className="pointer-events-none absolute -top-1 end-0 h-4 w-4 opacity-40" />
    </div>
  );
}

/**
 * Kid-mode equivalent of ParentPortalPage's ChildPanel: identical live
 * subscriptions (child record, points history, attendance, visible notes)
 * for whichever child tab is active, restyled into the reference's card
 * set — Your Child, Badges, Notes, Points by category, Recent points,
 * Attendance. Behaviour (removal detection, pagination) is unchanged.
 */
export default function KidChildPanel({
  studentId,
  onRemoved,
}: {
  studentId: string;
  onRemoved: (studentId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [child, setChild] = useState<StudentRecord | null>(null);
  const [pointsHistory, setPointsHistory] = useState<PointsTransaction[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pointsPage, setPointsPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setPointsPage(0);
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

  useEffect(() => {
    if (!loading && !child) onRemoved(studentId);
  }, [loading, child, studentId, onRemoved]);

  const pointsBreakdown = useMemo(() => {
    const totals = new Map<string, { total: number; count: number }>();
    for (const txn of pointsHistory) {
      const entry = totals.get(txn.reason) || { total: 0, count: 0 };
      entry.total += txn.amount;
      entry.count += 1;
      totals.set(txn.reason, entry);
    }
    return Array.from(totals.entries())
      .map(([reason, { total, count }]) => ({ reason, total, count }))
      .sort((a, b) => b.total - a.total);
  }, [pointsHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!child) return null;

  const POINTS_PAGE_SIZE = 10;
  const pointsPageCount = Math.max(1, Math.ceil(pointsHistory.length / POINTS_PAGE_SIZE));
  const pagedPoints = pointsHistory.slice(pointsPage * POINTS_PAGE_SIZE, (pointsPage + 1) * POINTS_PAGE_SIZE);

  const cardCls =
    "relative overflow-hidden rounded-[1.75rem] border border-white bg-white/95 p-6 shadow-[0_18px_34px_-24px_rgba(90,60,200,0.45)]";

  return (
    <div className="space-y-5">
      {/* Your Child */}
      <div className={cardCls}>
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-500">
            <User size={26} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-gold-600">
              {t("portal.parentWelcome")}
            </p>
            <h1 className="font-serif text-2xl font-extrabold text-navy-700">{child.name}</h1>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-gold-500">{child.points}</span>
              <span className="text-sm font-semibold text-cream-600">{t("students.points")}</span>
            </div>
          </div>
        </div>
        <StarDecor className="pointer-events-none absolute end-5 top-5 h-5 w-5 opacity-60" />
      </div>

      {/* Badges */}
      <div className={cardCls}>
        <CardHeader icon={<ShieldCheck size={18} />} title={t("students.badges")} />
        {child.badgeIds.length === 0 ? (
          <p className="text-sm font-semibold text-cream-600">{t("portal.noBadgesYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {child.badgeIds.map((badgeId) => {
              const badge = getBadgeDefinition(badgeId);
              if (!badge) return null;
              return (
                <div
                  key={badgeId}
                  className="flex items-center gap-2 rounded-full border border-gold-200 bg-gold-50 py-2 ps-2.5 pe-4"
                  title={badge.description}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg">
                    {badge.icon}
                  </span>
                  <span className="text-sm font-bold text-navy-700">{badge.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes */}
      {notes.length > 0 && (
        <div className={cardCls}>
          <CardHeader icon={<NotebookPen size={18} />} title={t("notes.title")} />
          <div className="space-y-2.5">
            {notes.map((note) => (
              <div
                key={note.id}
                className={`rounded-2xl border px-4 py-3 ${
                  note.sentiment === "positive"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                <RichText html={note.contentHtml} text={note.content} className="text-sm font-semibold" />
                {note.createdAt && (
                  <p className="mt-1 text-xs font-semibold opacity-70">
                    {formatNoteDate(note.createdAt, i18n.language)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points by category */}
      <div className={cardCls}>
        <CardHeader icon={<Star size={16} />} title={t("portal.pointsBreakdown")} />
        <p className="-mt-2.5 mb-4 text-sm font-semibold text-cream-600">{t("portal.pointsBreakdownHint")}</p>
        {pointsBreakdown.length === 0 ? (
          <p className="text-sm font-semibold text-cream-600">{t("portal.noPointsYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {pointsBreakdown.map(({ reason, total, count }) => (
              <div
                key={reason}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 ${
                  total >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <span className="text-sm font-bold text-navy-700">{t(`points.reasons.${reason}`)}</span>
                <span className="text-xs font-semibold text-cream-500">×{count}</span>
                <span className={`text-sm font-extrabold ${total >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {total >= 0 ? "+" : ""}
                  {total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent points */}
      <div className={cardCls}>
        <CardHeader icon={<Star size={16} />} title={t("portal.recentPoints")} />
        {pointsHistory.length === 0 ? (
          <p className="text-sm font-semibold text-cream-600">{t("portal.noPointsYet")}</p>
        ) : (
          <>
            <div className="divide-y divide-cream-300">
              {pagedPoints.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-bold text-navy-700">{t(`points.reasons.${txn.reason}`)}</p>
                    {txn.note && <p className="text-xs font-semibold text-cream-600">{txn.note}</p>}
                    {txn.createdAt && (
                      <p className="mt-0.5 text-xs font-semibold text-cream-500">
                        {formatNoteDate(txn.createdAt, i18n.language)}
                      </p>
                    )}
                  </div>
                  <span className={`font-extrabold ${txn.amount >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {txn.amount >= 0 ? "+" : ""}
                    {txn.amount}
                  </span>
                </div>
              ))}
            </div>
            {pointsPageCount > 1 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {Array.from({ length: pointsPageCount }, (_, i) => i).map((page) => (
                  <button
                    key={page}
                    onClick={() => setPointsPage(page)}
                    className={`h-8 w-8 rounded-full text-sm font-bold transition ${
                      pointsPage === page ? "bg-gold-400 text-navy-700" : "text-cream-600 hover:bg-cream-300"
                    }`}
                  >
                    {page + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Attendance */}
      <div className={cardCls}>
        <CardHeader icon={<CalendarDays size={18} />} title={t("attendance.title")} />
        {attendance.length === 0 ? (
          <p className="text-sm font-semibold text-cream-600">{t("portal.noAttendanceYet")}</p>
        ) : (
          <div className="divide-y divide-cream-300">
            {attendance.slice(0, 10).map((record) => (
              <div key={record.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-bold text-navy-700">{record.date}</span>
                <span className={`rounded-full px-3.5 py-1 text-xs font-extrabold ${STATUS_STYLES[record.status]}`}>
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
