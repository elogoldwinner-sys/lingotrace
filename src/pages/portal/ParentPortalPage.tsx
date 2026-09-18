import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Globe } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { subscribeToStudent, getStudentOnce } from "../../lib/services/studentsService";
import { subscribeToStudentPointsHistory } from "../../lib/services/pointsService";
import { subscribeToStudentAttendance } from "../../lib/services/attendanceService";
import { subscribeToVisibleParentNotes } from "../../lib/services/notesService";
import { getBadgeDefinition } from "../../lib/services/badgesService";
import { subscribeToAnnouncement } from "../../lib/services/announcementsService";
import { getClassRankingOnce, subscribeToClassRanking } from "../../lib/services/classRankingsService";
import { triggerWeeklyChampionsCelebration } from "../../lib/confetti";
import { formatNoteDate } from "../../lib/timestamps";
import { whatsappLink } from "../../lib/whatsapp";
import whatsappIcon from "../../assets/whatsapp-icon.png";
import Logo from "../../components/common/Logo";
import ThemeToggle from "../../components/common/ThemeToggle";
import AnnouncementCard from "../../components/common/AnnouncementCard";
import WeeklyChampions from "../../components/common/WeeklyChampions";
import type {
  PointsTransaction,
  AttendanceRecord,
  AttendanceStatus,
  NoteRecord,
  StudentRecord,
  Announcement,
  ClassRanking,
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
 *
 * `onRemoved` fires once, the moment we get a confirmed "this student
 * document no longer exists" (as opposed to "still loading") — e.g. the
 * teacher deleted the student. Before this, that case looked identical to
 * still-loading (both had `child === null`), so the panel just spun
 * forever instead of ever telling the parent what happened.
 */
function ChildPanel({ studentId, onRemoved }: { studentId: string; onRemoved: (studentId: string) => void }) {
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
    if (!loading && !child) {
      onRemoved(studentId);
    }
  }, [loading, child, studentId, onRemoved]);

  // "Legend" a parent asked for: totals per point reason across the child's
  // whole history (not just the current page), so strengths (top, green)
  // and weak spots (bottom, red) are visible at a glance instead of having
  // to scroll and mentally tally the raw transaction feed below.
  //
  // Must run before the loading/removed early returns below — React
  // requires every hook to run on every render, in the same order, so a
  // hook placed after a conditional `return` fires on some renders (once
  // loaded) but not others (while loading), which is exactly what threw
  // the "Rendered more hooks than during the previous render" (#310)
  // error a teacher hit after deploying this.
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
      <div className="py-16 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Confirmed gone (not just still loading) — render nothing here; the
  // parent page's onRemoved handler pops the alert and drops this tab.
  if (!child) return null;

  const POINTS_PAGE_SIZE = 10;
  const pointsPageCount = Math.max(1, Math.ceil(pointsHistory.length / POINTS_PAGE_SIZE));
  const pagedPoints = pointsHistory.slice(pointsPage * POINTS_PAGE_SIZE, (pointsPage + 1) * POINTS_PAGE_SIZE);

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
        <h2 className="text-lg font-semibold text-navy mb-1">{t("portal.pointsBreakdown")}</h2>
        <p className="text-xs text-cream-600 mb-4">{t("portal.pointsBreakdownHint")}</p>
        {pointsBreakdown.length === 0 ? (
          <p className="text-sm text-cream-600">{t("portal.noPointsYet")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pointsBreakdown.map(({ reason, total, count }) => (
              <div
                key={reason}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                  total >= 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"
                }`}
              >
                <span className="text-sm font-medium text-navy">{t(`points.reasons.${reason}`)}</span>
                <span className="text-xs text-cream-500">×{count}</span>
                <span className={`text-sm font-bold ${total >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {total >= 0 ? "+" : ""}
                  {total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">{t("portal.recentPoints")}</h2>
        {pointsHistory.length === 0 ? (
          <p className="text-sm text-cream-600">{t("portal.noPointsYet")}</p>
        ) : (
          <>
            <div className="divide-y divide-cream-400">
              {pagedPoints.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-navy">{t(`points.reasons.${txn.reason}`)}</p>
                    {txn.note && <p className="text-xs text-cream-600">{txn.note}</p>}
                    {txn.createdAt && (
                      <p className="text-xs text-cream-500 mt-0.5">{formatNoteDate(txn.createdAt, i18n.language)}</p>
                    )}
                  </div>
                  <span className={`font-semibold ${txn.amount >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {txn.amount >= 0 ? "+" : ""}
                    {txn.amount}
                  </span>
                </div>
              ))}
            </div>
            {pointsPageCount > 1 && (
              <div className="flex flex-wrap gap-1.5 justify-center mt-4">
                {Array.from({ length: pointsPageCount }, (_, i) => i).map((page) => (
                  <button
                    key={page}
                    onClick={() => setPointsPage(page)}
                    className={`h-8 w-8 rounded-lg text-sm font-semibold transition ${
                      pointsPage === page
                        ? "bg-gold text-navy"
                        : "text-cream-600 hover:bg-cream-300"
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

/**
 * Tiny standalone piece just for a tab's label (child's name), kept live so
 * a name edit reflects immediately. Also independently watches for that
 * child being removed — same undefined (still loading) vs null (confirmed
 * gone) distinction ChildPanel uses — so a removal is caught and the tab
 * dropped even when that child ISN'T the currently active tab, instead of
 * only ever being detected once the parent happens to click into it.
 */
function ChildTabLabel({
  studentId,
  onRemoved,
}: {
  studentId: string;
  onRemoved: (studentId: string) => void;
}) {
  const [child, setChild] = useState<StudentRecord | null | undefined>(undefined);
  useEffect(() => {
    setChild(undefined);
    const unsub = subscribeToStudent(studentId, setChild);
    return unsub;
  }, [studentId]);
  useEffect(() => {
    if (child === null) onRemoved(studentId);
  }, [child, studentId, onRemoved]);
  if (child === null) return null;
  return <>{child?.name || "…"}</>;
}

export default function ParentPortalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { portalParent, signOut } = useAuth();
  const [activeStudentId, setActiveStudentId] = useState("");
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [ownClassIds, setOwnClassIds] = useState<string[]>([]);
  const [ownRankings, setOwnRankings] = useState<Record<string, ClassRanking>>({});
  const [removedStudentIds, setRemovedStudentIds] = useState<string[]>([]);
  const alertedRemovalsRef = useRef<Set<string>>(new Set());
  const [whatsappByStudent, setWhatsappByStudent] = useState<Record<string, string | undefined>>({});

  const studentIds = (portalParent?.studentIds || []).filter((id) => !removedStudentIds.includes(id));

  // Fires once per child, the moment ChildPanel confirms that student's
  // record no longer exists (e.g. the teacher deleted it). Pops a one-time
  // notice and drops that tab immediately, instead of leaving a tab that
  // spins forever — the permanent fix (the teacher's deletion now detaches
  // the parent from that student — see studentsService.deleteStudent) means
  // it won't even show up here again after a refresh, but this covers the
  // current session and anything already orphaned before that fix shipped.
  function handleChildRemoved(studentId: string) {
    if (alertedRemovalsRef.current.has(studentId)) return;
    alertedRemovalsRef.current.add(studentId);
    window.alert(t("portal.childRemoved"));
    setRemovedStudentIds((prev) => [...prev, studentId]);
  }

  useEffect(() => {
    const unsubscribe = subscribeToAnnouncement(setAnnouncement);
    return unsubscribe;
  }, []);

  // Live per-child WhatsApp numbers for ALL linked children at once (not
  // just whichever tab is active) — this is what lets the floating contact
  // button below stay put across every tab instead of disappearing/
  // reappearing depending on which single child ChildPanel currently has
  // mounted.
  useEffect(() => {
    if (studentIds.length === 0) {
      setWhatsappByStudent({});
      return;
    }
    const unsubscribes = studentIds.map((sid) =>
      subscribeToStudent(sid, (data) => {
        setWhatsappByStudent((prev) => ({ ...prev, [sid]: data?.teacherWhatsapp }));
      })
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [studentIds.join(",")]);

  // Only the classes this parent's own children actually belong to — not
  // every class in the school. Also triggers the celebration confetti once
  // per portal visit if any of those classes currently has a board.
  useEffect(() => {
    if (studentIds.length === 0) {
      setOwnClassIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const children = await Promise.all(studentIds.map((sid) => getStudentOnce(sid)));
      const classIds = Array.from(
        new Set(children.filter((c): c is StudentRecord => !!c).map((c) => c.classId))
      );
      if (cancelled) return;
      setOwnClassIds(classIds);
      const rankings = await Promise.all(classIds.map((cid) => getClassRankingOnce(cid)));
      if (!cancelled && rankings.some((r) => r && (r.positions || []).length > 0)) {
        triggerWeeklyChampionsCelebration();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentIds.join(",")]);

  // Live-subscribe to each of those classes' boards so a teacher awarding
  // points or revealing a new week updates the portal without a refresh.
  useEffect(() => {
    if (ownClassIds.length === 0) {
      setOwnRankings({});
      return;
    }
    const unsubscribes = ownClassIds.map((classId) =>
      subscribeToClassRanking(classId, (ranking) => {
        setOwnRankings((prev) => {
          const next = { ...prev };
          if (ranking) next[classId] = ranking;
          else delete next[classId];
          return next;
        });
      })
    );
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [ownClassIds.join(",")]);

  useEffect(() => {
    if (studentIds.length > 0 && !studentIds.includes(activeStudentId)) {
      setActiveStudentId(studentIds[0]);
    } else if (studentIds.length === 0 && activeStudentId) {
      setActiveStudentId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalParent, removedStudentIds, studentIds.join(",")]);

  async function handleSignOut() {
    await signOut();
    navigate("/portal-login");
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar");
  }

  if (!portalParent) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Falls back to the first remaining child instead of waiting a render
  // cycle for the effect above to catch up (e.g. right after a removal) —
  // avoids a one-frame flash of the empty state.
  const currentStudentId = studentIds.includes(activeStudentId) ? activeStudentId : studentIds[0] || "";

  // Prefer the active tab's own teacher number; if that particular child
  // doesn't have one set, fall back to any linked sibling that does — this
  // is what makes the floating button show up on every tab instead of only
  // whichever child happens to have the field populated.
  const contactNumber =
    whatsappByStudent[currentStudentId] || studentIds.map((sid) => whatsappByStudent[sid]).find(Boolean);
  const contactHref = contactNumber ? whatsappLink(contactNumber) : null;

  return (
    <div className="min-h-screen bg-cream">
      <header className="flex items-center justify-between border-b border-cream-400 bg-cream-100/90 px-6 py-4">
        <div className="flex items-center gap-2">
          <Logo size={28} />
          <span className="font-serif text-xl font-semibold text-navy">{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
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
        {announcement && <AnnouncementCard announcement={announcement} />}

        {Object.values(ownRankings).filter((r) => (r.positions || []).length > 0).length > 0 && (
          <div className="space-y-4">
            {Object.values(ownRankings)
              .filter((r) => (r.positions || []).length > 0)
              .sort((a, b) => (a.className || "").localeCompare(b.className || ""))
              .map((r) => (
                <WeeklyChampions key={r.classId} ranking={r} classLabel={r.className} />
              ))}
          </div>
        )}

        {studentIds.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {studentIds.map((sid) => (
              <button
                key={sid}
                onClick={() => setActiveStudentId(sid)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  currentStudentId === sid
                    ? "border-gold bg-gold-50 text-navy"
                    : "border-cream-300 bg-white text-cream-600 hover:border-gold/50"
                }`}
              >
                <ChildTabLabel studentId={sid} onRemoved={handleChildRemoved} />
              </button>
            ))}
          </div>
        )}

        {currentStudentId ? (
          <ChildPanel key={currentStudentId} studentId={currentStudentId} onRemoved={handleChildRemoved} />
        ) : (
          <div className="card p-6 text-center text-sm text-cream-600">{t("portal.noChildrenLinked")}</div>
        )}
      </main>

      {/*
        Floating WhatsApp action button — lives at the page level (not
        inside ChildPanel) and is fixed to the viewport corner, so it stays
        put across every tab switch and reflects ANY of the parent's linked
        children's teacher number, not just whichever single child panel
        happens to be mounted.
      */}
      {contactHref && (
        <a
          href={contactHref}
          target="_blank"
          rel="noopener noreferrer"
          title={t("portal.contactWhatsapp")}
          aria-label={t("portal.contactWhatsapp")}
          className="fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105 hover:shadow-xl"
        >
          <img src={whatsappIcon} alt="" className="h-full w-full rounded-full" />
        </a>
      )}
    </div>
  );
}
