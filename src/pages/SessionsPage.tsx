import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus, Trash2, Shuffle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import { awardPoints } from "../lib/services/pointsService";
import {
  subscribeToSessions,
  createSession,
  deleteSession,
} from "../lib/services/sessionsService";
import type { ClassRecord, SessionRecord, StudentRecord, PointsReason } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

const POINTS_REASONS: PointsReason[] = [
  "participation",
  "homework",
  "behavior",
  "attendance",
  "assignment",
  "manual",
  "other",
];

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

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [topic, setTopic] = useState("");
  const [objectives, setObjectives] = useState("");

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [pointsModalStudent, setPointsModalStudent] = useState<StudentRecord | null>(null);
  const [pointsAmount, setPointsAmount] = useState(5);
  const [pointsReason, setPointsReason] = useState<PointsReason>("participation");

  const [isPicking, setIsPicking] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const pickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function openPointsModal(student: StudentRecord, direction: 1 | -1 = 1) {
    setPointsAmount(direction * 5);
    setPointsReason("participation");
    setPointsModalStudent(student);
  }

  function handleRandomPick() {
    if (students.length === 0 || isPicking) return;
    setIsPicking(true);

    const durationMs = 1800;
    const tickMs = 90;
    let elapsed = 0;

    pickIntervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * students.length);
      setHighlightedId(students[randomIndex].id);
      elapsed += tickMs;

      if (elapsed >= durationMs) {
        if (pickIntervalRef.current) clearInterval(pickIntervalRef.current);
        const winner = students[Math.floor(Math.random() * students.length)];
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createSession({ classId: selectedClassId, title, date, topic, objectives });
    setTitle("");
    setTopic("");
    setObjectives("");
    setModalOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("sessions.title")}</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="input-field w-auto"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={() => setModalOpen(true)} className="btn-primary" disabled={!selectedClassId}>
            <Plus size={16} />
            {t("sessions.newSession")}
          </button>
        </div>
      </div>

      {selectedClassId && students.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-navy">{t("sessions.rosterTitle")}</h2>
            <button
              onClick={handleRandomPick}
              disabled={isPicking}
              className="btn-gold py-1.5 px-3 text-sm disabled:opacity-60"
            >
              <Shuffle size={16} className={isPicking ? "animate-spin" : ""} />
              {isPicking ? t("sessions.picking") : t("sessions.randomPick")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {students.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                  highlightedId === s.id
                    ? "border-gold bg-gold-50 scale-[1.02] shadow-sm"
                    : "border-cream-300 bg-white"
                }`}
              >
                {s.photoURL ? (
                  <img
                    src={s.photoURL}
                    alt={s.name}
                    className="h-9 w-9 rounded-full object-cover border border-gold/40 shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-full bg-navy text-cream-100 flex items-center justify-center text-sm font-semibold">
                    {s.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy truncate">{s.name}</p>
                  <p className="text-xs text-cream-600">
                    {s.points} {t("students.points")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openPointsModal(s, -1)}
                    title={t("points.deduct")}
                    className="h-7 w-7 flex items-center justify-center rounded-full border border-cream-300 text-cream-700 hover:border-red-400 hover:text-red-600 transition"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    onClick={() => openPointsModal(s, 1)}
                    title={t("points.award")}
                    className="h-7 w-7 flex items-center justify-center rounded-full border border-cream-300 text-cream-700 hover:border-gold hover:text-gold transition"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="📝" />
      ) : (
        <div className="card divide-y divide-cream-400">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-start justify-between px-5 py-4">
              <div>
                <p className="font-semibold text-navy">{s.title}</p>
                <p className="text-xs text-cream-600">{s.date}</p>
                {s.topic && <p className="text-sm text-navy mt-1">{t("sessions.topic")}: {s.topic}</p>}
                {s.objectives && (
                  <p className="text-sm text-cream-600 mt-1">{s.objectives}</p>
                )}
              </div>
              <button
                onClick={() => deleteSession(s.id)}
                className="text-cream-600 hover:text-red-600 p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("sessions.newSession")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="input-field" />
          <input
            placeholder={t("sessions.topic")}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="input-field"
          />
          <textarea
            placeholder={t("sessions.objectives")}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            className="input-field"
            rows={3}
          />
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
                onClick={() => setPointsAmount((v) => -Math.abs(v || 5))}
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
                onClick={() => setPointsAmount((v) => Math.abs(v || 5))}
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
            <select
              value={pointsReason}
              onChange={(e) => setPointsReason(e.target.value as PointsReason)}
              className="input-field"
            >
              {POINTS_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`points.reasons.${reason}`)}
                </option>
              ))}
            </select>
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
    </div>
  );
}
