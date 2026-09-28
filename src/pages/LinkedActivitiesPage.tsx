import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToClassAssignments,
  createLinkedAssignment,
  deleteLinkedAssignment,
  subscribeToLinkedResult,
} from "../lib/services/linkedActivityService";
import type { ClassRecord, LinkedAssignment, StudentRecord, LinkedResult } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";

type Source = "gatway" | "play";

/** One row of a class's roster, showing that student's score for one assignment once it's in. */
function StudentResultRow({ student, assignment }: { student: StudentRecord; assignment: LinkedAssignment }) {
  const [result, setResult] = useState<LinkedResult | null>(null);

  useEffect(() => {
    return subscribeToLinkedResult(assignment.id, student.id, setResult);
  }, [assignment.id, student.id]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-cream-400 px-3 py-2 text-sm">
      <span className="text-navy">{student.name}</span>
      {result ? (
        <span className="font-semibold text-teal-700">{result.score}%</span>
      ) : (
        <span className="text-navy/40">—</span>
      )}
    </div>
  );
}

export default function LinkedActivitiesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [source, setSource] = useState<Source>("gatway");
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [assignments, setAssignments] = useState<LinkedAssignment[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    if (!user) return;
    return subscribeToClasses(
      user.uid,
      (data) => {
        setClasses(data);
        if (!selectedClassId && data.length > 0) setSelectedClassId(data[0].id);
      },
      () => {}
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedClassId) {
      setAssignments([]);
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubAssignments = subscribeToClassAssignments(
      selectedClassId,
      (data) => {
        setAssignments(data.filter((a) => a.source === source));
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load linked assignments for", selectedClassId, error);
        setLoading(false);
      }
    );
    const unsubStudents = subscribeToStudents(selectedClassId, setStudents);
    return () => {
      unsubAssignments();
      unsubStudents();
    };
  }, [selectedClassId, source]);

  async function handleCreate() {
    if (!user || !selectedClassId || !title.trim() || !url.trim()) return;
    setSubmitting(true);
    try {
      await createLinkedAssignment({
        classId: selectedClassId,
        teacherId: user.uid,
        title: title.trim(),
        url: url.trim(),
        source,
      });
      setTitle("");
      setUrl("");
      setCreateModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const urlPlaceholder =
    source === "gatway" ? "https://gatway.app/exam/take/..." : "https://play.lingobite.app/play/...";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">{t("linked.title")}</h1>
        <button
          onClick={() => setCreateModalOpen(true)}
          disabled={!selectedClassId}
          className="flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-cream-100 hover:bg-navy-700 disabled:opacity-40"
        >
          <Plus size={16} />
          {t("linked.assign")}
        </button>
      </div>

      <div className="flex gap-2 border-b border-cream-400">
        {(["gatway", "play"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`px-4 py-2 text-sm font-semibold ${
              source === s ? "border-b-2 border-navy text-navy" : "text-navy/50 hover:text-navy"
            }`}
          >
            {t(s === "gatway" ? "linked.tabGatway" : "linked.tabPlay")}
          </button>
        ))}
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : assignments.length === 0 ? (
        <EmptyState message={t("linked.noAssignments")} />
      ) : (
        <div className="flex flex-col gap-3">
          {assignments.map((a) => (
            <div key={a.id} className="rounded-xl border border-cream-400 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-navy">{a.title}</p>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-navy/60 hover:text-navy"
                  >
                    <ExternalLink size={12} />
                    {a.url}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpandedId(expandedId === a.id ? "" : a.id)}
                    className="text-xs font-semibold text-navy/70 hover:text-navy"
                  >
                    {expandedId === a.id ? t("linked.hideResults") : t("linked.showResults")}
                  </button>
                  <button
                    onClick={() => deleteLinkedAssignment(a.id)}
                    className="text-red-500 hover:text-red-700"
                    title={t("common.delete")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {expandedId === a.id && (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-cream-300 pt-3">
                  {students.map((s) => (
                    <StudentResultRow key={s.id} student={s} assignment={a} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={t("linked.assign")}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-navy">{t("linked.activityTitle")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-cream-400 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-navy">
              {source === "gatway" ? t("linked.examLink") : t("linked.playLink")}
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={urlPlaceholder}
              className="w-full rounded-lg border border-cream-400 px-3 py-2"
            />
            <p className="mt-1 text-xs text-navy/50">
              {source === "gatway" ? t("linked.examLinkHint") : t("linked.playLinkHint")}
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={submitting || !title.trim() || !url.trim()}
            className="mt-2 rounded-lg bg-navy px-4 py-2 font-semibold text-cream-100 disabled:opacity-40"
          >
            {submitting ? t("common.loading") : t("linked.assign")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
