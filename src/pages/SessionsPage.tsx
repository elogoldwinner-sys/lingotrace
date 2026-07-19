import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus, Trash2, Shuffle, X, Layers, NotebookPen } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import { awardPoints } from "../lib/services/pointsService";
import { createNote } from "../lib/services/notesService";
import {
  subscribeToSessions,
  createSession,
  createSessionsBulk,
  deleteSession,
  type WeekdaySessionCounts,
} from "../lib/services/sessionsService";
import { subscribeToAttendanceBySession } from "../lib/services/attendanceService";
import type {
  ClassRecord,
  SessionRecord,
  StudentRecord,
  PointsReason,
  AttendanceRecord,
  AttendanceStatus,
  NoteSentiment,
} from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";

const POINTS_REASONS: PointsReason[] = [
  "participation",
  "homework",
  "behavior",
  "attendance",
  "assignment",
  "manual",
  "other",
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700 border-green-300",
  absent: "bg-red-100 text-red-700 border-red-300",
  late: "bg-gold-100 text-gold-700 border-gold-300",
  excused: "bg-navy-100 text-navy border-navy-200",
};

// Sunday-first, 5-day school week.
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

// Only students flagged present or late in the active session are eligible for random pick.
const RANDOM_PICK_ELIGIBLE_STATUSES: AttendanceStatus[] = ["present", "late"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SessionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [date, setDate] = useState(todayISO());

  // Bulk-generation form state — just the date range + weekly distribution now.
  const [bulkStart, setBulkStart] = useState(todayISO());
  const [bulkEnd, setBulkEnd] = useState(todayISO());
  const [weekdayCounts, setWeekdayCounts] = useState<WeekdaySessionCounts>([0, 1, 1, 1, 1]);

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [pointsModalStudent, setPointsModalStudent] = useState<StudentRecord | null>(null);
  const [pointsAmount, setPointsAmount] = useState(1);
  const [pointsReason, setPointsReason] = useState<PointsReason>("participation");

  const [noteModalStudent, setNoteModalStudent] = useState<StudentRecord | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteSentiment, setNoteSentiment] = useState<NoteSentiment>("positive");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [isPicking, setIsPicking] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pickNotice, setPickNotice] = useState("");
  const pickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active session (the one currently expanded to apply session procedures)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionAttendance, setSessionAttendance] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    return () => {
      if (pickIntervalRef.current) clearInterval(pickIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(user.uid, (data) => {
      setClasses(data);
      if (!selectedClassId && data.length > 0) setSelectedClassId(data[0].id);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      return;
    }
    const unsubscribe = subscribeToStudents(selectedClassId, setStudents);
    return unsubscribe;
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    setActiveSessionId(null);
    const unsubscribe = subscribeToSessions(
      selectedClassId,
      (data) => {
        setSessions(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [selectedClassId]);

  useEffect(() => {
    if (!activeSessionId) {
      setSessionAttendance([]);
      return;
    }
    const unsubscribe = subscribeToAttendanceBySession(activeSessionId, setSessionAttendance);
    return unsubscribe;
  }, [activeSessionId]);

  const sessionAttendanceByStudent = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    sessionAttendance.forEach((r) => map.set(r.studentId, r));
    return map;
  }, [sessionAttendance]);

  function openPointsModal(student: StudentRecord, direction: 1 | -1 = 1) {
    setPointsAmount(direction * 1);
    setPointsReason("participation");
    setPointsModalStudent(student);
  }

  function openNoteModal(student: StudentRecord) {
    setNoteContent("");
    setNoteSentiment("positive");
    setNoteModalStudent(student);
  }

  function handleRandomPick() {
    if (isPicking) return;
    const eligible = students.filter((st) => {
      const status = sessionAttendanceByStudent.get(st.id)?.status;
      return status && RANDOM_PICK_ELIGIBLE_STATUSES.includes(status);
    });
    if (eligible.length === 0) {
      setPickNotice(t("sessions.noEligibleForPick"));
      return;
    }
    setPickNotice("");
    setIsPicking(true);

    const durationMs = 1800;
    const tickMs = 90;
    let elapsed = 0;

    pickIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * eligible.length);
      setHighlightedId(eligible[randomIndex].id);
      elapsed += tickMs;

      if (elapsed >= durationMs) {
        if (pickIntervalRef.current) clearInterval(pickIntervalRef.current);
        const winner = eligible[Math.floor(Math.random() * eligible.length)];
        setHighlightedId(winner.id);
        setIsPicking(false);
        setTimeout(() => openPointsModal(winner), 450);
      }
    }, tickMs);
  }

  async function handleAwardPoints(e: React.FormEvent) {
    e.preventDefault();
    if (!pointsModalStudent || !user) return;
    await awardPoints({
      studentId: pointsModalStudent.id,
      classId: pointsModalStudent.classId,
      amount: pointsAmount,
      reason: pointsReason,
      awardedBy: user.uid,
    });
    setPointsModalStudent(null);
    setHighlightedId(null);
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteModalStudent || !user || !noteContent.trim()) return;
    setNoteSubmitting(true);
    try {
      await createNote({
        studentId: noteModalStudent.id,
        classId: noteModalStudent.classId,
        authorId: user.uid,
        content: noteContent.trim(),
        sentiment: noteSentiment,
        visibleToParent: true,
        sessionId: activeSessionId || undefined,
      });
      setNoteModalStudent(null);
    } finally {
      setNoteSubmitting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createSession({ classId: selectedClassId, date });
    setModalOpen(false);
  }

  async function handleBulkGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClassId) return;
    setBulkSubmitting(true);
    try {
      await createSessionsBulk({
        classId: selectedClassId,
        startDate: bulkStart,
        endDate: bulkEnd,
        weekdayCounts,
      });
      setBulkModalOpen(false);
    } finally {
      setBulkSubmitting(false);
    }
  }

  function updateWeekdayCount(index: number, value: number) {
    setWeekdayCounts((prev) => {
      const next = [...prev] as WeekdaySessionCounts;
      next[index] = Math.max(0, Math.min(4, value));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("sessions.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setBulkModalOpen(true)}
            className="btn-secondary"
            disabled={!selectedClassId}
          >
            <Layers size={16} />
            {t("sessions.bulkGenerate")}
          </button>
          <button onClick={() => setModalOpen(true)} className="btn-primary" disabled={!selectedClassId}>
            <Plus size={16} />
            {t("sessions.newSession")}
          </button>
        </div>
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <EmptyState message={t("sessions.noSessions")} icon="📝" />
      ) : (
        <div className="card divide-y divide-cream-400">
          {sessions.map((s) => (
            <div key={s.id}>
              <button
                onClick={() => setActiveSessionId(activeSessionId === s.id ? null : s.id)}
                className={`w-full text-left flex items-start justify-between px-5 py-4 transition-colors ${
                  activeSessionId === s.id ? "bg-gold-50" : "hover:bg-cream-300/40"
                }`}
              >
                <div>
                  <p className="font-semibold text-navy">{s.title}</p>
                  <p className="text-xs text-cream-600">{s.date}</p>
                  {s.topic && (
                    <p className="text-sm text-navy mt-1">
                      {t("sessions.topic")}: {s.topic}
                    </p>
                  )}
                  {s.objectives && <p className="text-sm text-cream-600 mt-1">{s.objectives}</p>}
                </div>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                    if (activeSessionId === s.id) setActiveSessionId(null);
                  }}
                  className="text-cream-600 hover:text-red-600 p-1 shrink-0"
                >
                  <Trash2 size={16} />
                </span>
              </button>

              {activeSessionId === s.id && (
                <div className="px-5 pb-5 space-y-4 bg-cream-100/60">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
                    <h3 className="text-sm font-semibold text-navy">{t("sessions.rosterTitle")}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRandomPick}
                        disabled={isPicking}
                        className="btn-gold py-1.5 px-3 text-sm disabled:opacity-60"
                      >
                        <Shuffle size={16} className={isPicking ? "animate-spin" : ""} />
                        {isPicking ? t("sessions.picking") : t("sessions.randomPick")}
                      </button>
                      <button
                        onClick={() => setActiveSessionId(null)}
                        className="h-8 w-8 flex items-center justify-center rounded-full text-cream-600 hover:bg-cream-300"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {pickNotice && (
                    <p className="text-xs text-red-600 -mt-2">{pickNotice}</p>
                  )}
                  <p className="text-xs text-cream-600 -mt-2">{t("sessions.attendanceHint")}</p>
                  <p className="text-xs text-cream-600 -mt-2">{t("sessions.randomPickHint")}</p>

                  <div className="space-y-2">
                    {students.map((st) => {
                      const currentStatus = sessionAttendanceByStudent.get(st.id)?.status;
                      const isBlocked = currentStatus === "absent" || currentStatus === "excused";
                      return (
                        <div
                          key={st.id}
                          className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                            highlightedId === st.id
                              ? "border-gold bg-gold-50 sm:scale-[1.01] shadow-sm"
                              : "border-cream-300 bg-white"
                          } ${isBlocked ? "opacity-50" : ""}`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {st.photoURL ? (
                              <img
                                src={st.photoURL}
                                alt={st.name}
                                className="h-9 w-9 rounded-full object-cover border border-gold/40 shrink-0"
                              />
                            ) : (
                              <div className="h-9 w-9 shrink-0 rounded-full bg-navy text-cream-100 flex items-center justify-center text-sm font-semibold">
                                {st.name[0]?.toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-navy truncate">{st.name}</p>
                              <p className="text-xs text-cream-600">
                                {st.points} {t("students.points")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => openNoteModal(st)}
                                disabled={isBlocked}
                                title={t("notes.add")}
                                className="h-7 w-7 flex items-center justify-center rounded-full border border-cream-300 text-cream-700 hover:border-navy hover:text-navy transition disabled:pointer-events-none disabled:opacity-40"
                              >
                                <NotebookPen size={14} />
                              </button>
                              <button
                                onClick={() => openPointsModal(st, -1)}
                                disabled={isBlocked}
                                title={t("points.deduct")}
                                className="h-7 w-7 flex items-center justify-center rounded-full border border-cream-300 text-cream-700 hover:border-red-400 hover:text-red-600 transition disabled:pointer-events-none disabled:opacity-40"
                              >
                                <Minus size={14} />
                              </button>
                              <button
                                onClick={() => openPointsModal(st, 1)}
                                disabled={isBlocked}
                                title={t("points.award")}
                                className="h-7 w-7 flex items-center justify-center rounded-full border border-cream-300 text-cream-700 hover:border-gold hover:text-gold transition disabled:pointer-events-none disabled:opacity-40"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {currentStatus ? (
                              <span className={`pill border text-xs ${STATUS_STYLES[currentStatus]}`}>
                                {t(`attendance.${currentStatus}`)}
                              </span>
                            ) : (
                              <span className="pill border text-xs bg-white text-cream-500 border-cream-400">
                                {t("attendance.notMarked")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {students.length === 0 && (
                      <p className="text-center text-sm text-cream-600 py-4">
                        {t("students.noStudents")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("sessions.newSession")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("sessions.date")}</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={t("sessions.bulkGenerate")}
      >
        <form onSubmit={handleBulkGenerate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-eyebrow block mb-1.5">{t("sessions.startDate")}</label>
              <input
                type="date"
                required
                value={bulkStart}
                onChange={(e) => setBulkStart(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-1.5">{t("sessions.endDate")}</label>
              <input
                type="date"
                required
                value={bulkEnd}
                onChange={(e) => setBulkEnd(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label-eyebrow block mb-2">{t("sessions.weeklyDistribution")}</label>
            <p className="text-xs text-cream-600 mb-2">{t("sessions.weeklyDistributionHint")}</p>
            <div className="grid grid-cols-5 gap-2">
              {WEEKDAY_LABELS.map((label, index) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span className="text-[11px] font-semibold text-navy text-center">
                    {t(`sessions.weekdays.${index}`)}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    value={weekdayCounts[index]}
                    onChange={(e) => updateWeekdayCount(index, Number(e.target.value))}
                    className="input-field text-center px-1"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setBulkModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={bulkSubmitting} className="btn-primary">
              {bulkSubmitting ? t("common.loading") : t("sessions.generate")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!pointsModalStudent}
        onClose={() => setPointsModalStudent(null)}
        title={`${t("points.award")} — ${pointsModalStudent?.name || ""}`}
      >
        <form onSubmit={handleAwardPoints} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("points.amount")}</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPointsAmount((v) => -Math.abs(v || 1))}
                className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full border transition ${
                  pointsAmount < 0
                    ? "border-red-400 bg-red-50 text-red-600"
                    : "border-cream-300 text-cream-600 hover:border-red-400 hover:text-red-600"
                }`}
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                value={pointsAmount}
                onChange={(e) => setPointsAmount(Number(e.target.value))}
                className="input-field text-center"
              />
              <button
                type="button"
                onClick={() => setPointsAmount((v) => Math.abs(v || 1))}
                className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-full border transition ${
                  pointsAmount > 0
                    ? "border-gold bg-gold-50 text-gold"
                    : "border-cream-300 text-cream-600 hover:border-gold hover:text-gold"
                }`}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("points.reason")}</label>
            <div className="flex flex-wrap gap-2">
              {POINTS_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setPointsReason(reason)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                    pointsReason === reason
                      ? "border-gold bg-gold-50 text-gold"
                      : "border-cream-300 text-cream-600 hover:border-gold/50 hover:text-gold"
                  }`}
                >
                  {t(`points.reasons.${reason}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPointsModalStudent(null)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!noteModalStudent}
        onClose={() => setNoteModalStudent(null)}
        title={`${t("notes.add")} — ${noteModalStudent?.name || ""}`}
      >
        <form onSubmit={handleAddNote} className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNoteSentiment("positive")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                noteSentiment === "positive"
                  ? "border-green-400 bg-green-50 text-green-700"
                  : "border-cream-300 text-cream-600 hover:border-green-300"
              }`}
            >
              {t("notes.positive")}
            </button>
            <button
              type="button"
              onClick={() => setNoteSentiment("negative")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                noteSentiment === "negative"
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-cream-300 text-cream-600 hover:border-red-300"
              }`}
            >
              {t("notes.negative")}
            </button>
          </div>
          <textarea
            required
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className="input-field"
            rows={4}
            placeholder={t("notes.contentPlaceholder")}
          />
          <p className="text-xs text-cream-600">{t("notes.parentOnlyHint")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNoteModalStudent(null)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={noteSubmitting} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
