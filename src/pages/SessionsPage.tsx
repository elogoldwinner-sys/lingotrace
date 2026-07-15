import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import {
  subscribeToSessions,
  createSession,
  deleteSession,
} from "../lib/services/sessionsService";
import type { ClassRecord, SessionRecord } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

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
    </div>
  );
}
