import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ExternalLink, Award } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToClassAssignments,
  createLinkedAssignment,
  deleteLinkedAssignment,
  subscribeToLinkedResult,
  subscribeToMarkAward,
  addMarkForResult,
  marksForScore,
} from "../lib/services/linkedActivityService";
import type { ClassRecord, LinkedAssignment, StudentRecord, LinkedResult, LinkedMarkAward } from "../types";
import { formatNoteDate } from "../lib/timestamps";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";

type Source = "gatway" | "play";

/** Live result + mark-added state of every student for ONE exam/game. */
function useAssignmentStatuses(assignmentId: string, studentIds: string[]) {
  const [results, setResults] = useState<Record<string, LinkedResult | null>>({});
  const [awards, setAwards] = useState<Record<string, LinkedMarkAward | null>>({});
  const idsKey = studentIds.join("|");

  useEffect(() => {
    setResults({});
    setAwards({});
    const unsubs = idsKey
      .split("|")
      .filter(Boolean)
      .flatMap((id) => [
        subscribeToLinkedResult(assignmentId, id, (r) => setResults((prev) => ({ ...prev, [id]: r }))),
        subscribeToMarkAward(assignmentId, id, (a) => setAwards((prev) => ({ ...prev, [id]: a }))),
      ]);
    return () => unsubs.forEach((u) => u());
  }, [assignmentId, idsKey]);

  // Wait for every first answer so a student whose mark was already added never flashes on screen.
  const ready = studentIds.every((id) => id in results && id in awards);
  return { results, awards, ready };
}

/** One row of a class's roster: the student's score, and the button that turns it into marks. */
function StudentResultRow({
  student,
  result,
  assignment,
  teacherId,
}: {
  student: StudentRecord;
  result: LinkedResult | null;
  assignment: LinkedAssignment;
  teacherId: string;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  async function handleAddMark() {
    if (!result || adding) return;
    setAdding(true);
    setError("");
    try {
      await addMarkForResult({
        assignment,
        studentId: student.id,
        score: result.score,
        title: assignment.title,
        awardedBy: teacherId,
      });
      // Nothing more to do: once the mark exists, this row leaves the list by itself.
    } catch (err) {
      if (!(err instanceof Error && err.message === "already-added")) {
        setError(t("linked.addMarkError"));
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-cream-400 px-3 py-2 text-sm">
      <span className="text-navy">{student.name}</span>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {result && (
          <button
            onClick={handleAddMark}
            disabled={adding}
            className="btn-gold py-1 px-2.5 text-xs disabled:opacity-60"
          >
            <Award size={13} />
            {adding ? t("common.loading") : t("linked.addMarks", { points: marksForScore(result.score) })}
          </button>
        )}
        {result ? (
          <span className="font-semibold text-teal-700">{result.score}%</span>
        ) : (
          <span className="text-navy/40">—</span>
        )}
      </div>
    </div>
  );
}

/**
 * Results for one exam/game: students who already did it come first, then the
 * ones who haven't yet. A student whose mark has been added leaves the list
 * (their points stay in their record).
 */
function AssignmentResults({
  assignment,
  students,
  teacherId,
}: {
  assignment: LinkedAssignment;
  students: StudentRecord[];
  teacherId: string;
}) {
  const { t } = useTranslation();
  const { results, awards, ready } = useAssignmentStatuses(
    assignment.id,
    students.map((s) => s.id)
  );

  if (!ready) return <Spinner />;

  const open = students.filter((s) => !awards[s.id]);
  const done = open.filter((s) => results[s.id]);
  const notYet = open.filter((s) => !results[s.id]);
  const marked = students.length - open.length;

  return (
    <div className="flex flex-col gap-1.5">
      {open.length > 0 && (
        <p className="mb-1 text-xs text-navy/50">
          {t("linked.progress", { done: done.length, pending: notYet.length })}
        </p>
      )}
      {[...done, ...notYet].map((s) => (
        <StudentResultRow
          key={s.id}
          student={s}
          result={results[s.id] || null}
          assignment={assignment}
          teacherId={teacherId}
        />
      ))}
      {open.length === 0 && students.length > 0 && (
        <p className="py-2 text-center text-sm text-navy/50">{t("linked.allMarked")}</p>
      )}
      {marked > 0 && open.length > 0 && (
        <p className="mt-1 text-xs text-navy/40">{t("linked.markedHidden", { count: marked })}</p>
      )}
    </div>
  );
}

export default function LinkedActivitiesPage() {
  const { t, i18n } = useTranslation();
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
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    title={a.url}
                    className="group flex min-w-0 items-center gap-1.5 font-semibold text-navy hover:text-gold hover:underline"
                  >
                    <span className="truncate">{a.title}</span>
                    <ExternalLink size={14} className="shrink-0 opacity-40 group-hover:opacity-100" />
                  </a>
                  {formatNoteDate(a.createdAt, i18n.language) && (
                    <p className="text-xs text-navy/50">
                      {t("linked.addedOn", { date: formatNoteDate(a.createdAt, i18n.language) })}
                    </p>
                  )}
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
                <div className="mt-3 border-t border-cream-300 pt-3">
                  <AssignmentResults assignment={a} students={students} teacherId={user?.uid || ""} />
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
