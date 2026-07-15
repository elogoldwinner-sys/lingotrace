import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToStudentNotes,
  createNote,
  deleteNote,
} from "../lib/services/notesService";
import type { ClassRecord, StudentRecord, NoteRecord } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

export default function NotesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [content, setContent] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(false);

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
    const unsubscribe = subscribeToStudents(selectedClassId, (data) => {
      setStudents(data);
      if (data.length > 0) setSelectedStudentId(data[0].id);
      else setSelectedStudentId("");
    });
    return unsubscribe;
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedStudentId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeToStudentNotes(
      selectedStudentId,
      (data) => {
        setNotes(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [selectedStudentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedStudentId) return;
    await createNote({
      studentId: selectedStudentId,
      classId: selectedClassId,
      authorId: user.uid,
      content,
      visibleToParent,
    });
    setContent("");
    setVisibleToParent(false);
    setModalOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("notes.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="input-field w-auto">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="input-field w-auto">
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => setModalOpen(true)} className="btn-primary" disabled={!selectedStudentId}>
            <Plus size={16} />
            {t("notes.add")}
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : notes.length === 0 ? (
        <EmptyState message={t("students.noStudents")} icon="🗒️" />
      ) : (
        <div className="card divide-y divide-cream-400">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="flex items-start gap-2">
                {n.visibleToParent ? (
                  <Eye size={16} className="mt-1 text-gold" />
                ) : (
                  <EyeOff size={16} className="mt-1 text-cream-600" />
                )}
                <p className="text-sm text-navy">{n.content}</p>
              </div>
              <button onClick={() => deleteNote(n.id)} className="text-cream-600 hover:text-red-600 p-1">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("notes.add")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="input-field"
            rows={4}
          />
          <label className="flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={visibleToParent}
              onChange={(e) => setVisibleToParent(e.target.checked)}
            />
            {t("notes.visibleToParent")}
          </label>
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
