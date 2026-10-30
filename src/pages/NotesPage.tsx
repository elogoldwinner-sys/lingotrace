import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, CheckCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import { subscribeToSessions } from "../lib/services/sessionsService";
import {
  subscribeToClassNotes,
  createNote,
  deleteNote,
} from "../lib/services/notesService";
import type {
  ClassRecord,
  StudentRecord,
  SessionRecord,
  NoteRecord,
  NoteSentiment,
} from "../types";
import Modal from "../components/common/Modal";
import RichText from "../components/common/RichText";
import RichTextEditor from "../components/common/RichTextEditor";
import { richHtmlToPlainText, sanitizeRichHtml } from "../lib/richText";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";
import { formatNoteDate } from "../lib/timestamps";

export default function NotesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Formatted note body (HTML) from the editor.
  const [contentHtml, setContentHtml] = useState("");
  const [sentiment, setSentiment] = useState<NoteSentiment>("positive");

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
      setSelectedStudentId((prev) => (data.some((st) => st.id === prev) ? prev : data[0]?.id || ""));
    });
    return unsubscribe;
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) {
      setSessions([]);
      return;
    }
    const unsubscribe = subscribeToSessions(selectedClassId, setSessions, console.error);
    return unsubscribe;
  }, [selectedClassId]);

  // All of the class's notes (every student) — no student dropdown needed to see them.
  useEffect(() => {
    if (!selectedClassId || !user) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeToClassNotes(
      selectedClassId,
      user.uid,
      (data) => {
        setNotes(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [selectedClassId, user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedStudentId) return;
    const plainText = richHtmlToPlainText(contentHtml);
    if (!plainText) return;
    await createNote({
      studentId: selectedStudentId,
      classId: selectedClassId,
      authorId: user.uid,
      content: plainText,
      contentHtml: sanitizeRichHtml(contentHtml),
      sentiment,
      visibleToParent: true,
    });
    setContentHtml("");
    setSentiment("positive");
    setModalOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold text-navy">{t("notes.title")}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setModalOpen(true)} className="btn-primary" disabled={students.length === 0}>
            <Plus size={16} />
            {t("notes.add")}
          </button>
        </div>
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : notes.length === 0 ? (
        <EmptyState message={t("notes.noneYet")} icon="🗒️" />
      ) : (
        <div className="card divide-y divide-cream-400">
          {notes.map((n) => {
            const noteStudent = students.find((s) => s.id === n.studentId);
            const noteSession = n.sessionId ? sessions.find((se) => se.id === n.sessionId) : undefined;
            return (
              <div
                key={n.id}
                className={`flex items-start justify-between gap-3 px-5 py-4 border-l-4 ${
                  n.sentiment === "positive"
                    ? "border-l-green-400 bg-green-50/60"
                    : "border-l-red-400 bg-red-50/60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-navy/70">
                    {noteStudent?.name || t("students.title")}
                    {noteSession && (
                      <span className="font-normal text-cream-600"> · {noteSession.title}</span>
                    )}
                    {n.createdAt && (
                      <span className="font-normal text-cream-600">
                        {" "}
                        · {formatNoteDate(n.createdAt, i18n.language)}
                      </span>
                    )}
                  </p>
                  <RichText html={n.contentHtml} text={n.content} className="text-sm text-navy mt-0.5" />
                  {n.visibleToParent &&
                    (n.readByParent ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                        <CheckCheck size={13} />
                        {t("notes.readByParent")}
                        {n.readAt ? ` · ${formatNoteDate(n.readAt, i18n.language)}` : ""}
                      </span>
                    ) : (
                      <span className="mt-1.5 inline-flex items-center rounded-full bg-cream-300 px-2.5 py-0.5 text-xs font-semibold text-cream-700">
                        {t("notes.notReadYet")}
                      </span>
                    ))}
                </div>
                <button onClick={() => deleteNote(n.id)} className="text-cream-600 hover:text-red-600 p-1 shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("notes.add")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-eyebrow mb-1 block">{t("notes.forStudent")}</label>
            <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)} className="input-field">
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSentiment("positive")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                sentiment === "positive"
                  ? "border-green-400 bg-green-50 text-green-700"
                  : "border-cream-300 text-cream-600 hover:border-green-300"
              }`}
            >
              {t("notes.positive")}
            </button>
            <button
              type="button"
              onClick={() => setSentiment("negative")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                sentiment === "negative"
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-cream-300 text-cream-600 hover:border-red-300"
              }`}
            >
              {t("notes.negative")}
            </button>
          </div>
          <RichTextEditor value={contentHtml} onChange={setContentHtml} minHeightClass="min-h-[6rem]" />
          <p className="text-xs text-cream-600">{t("notes.parentOnlyHint")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={!contentHtml} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
