import FeatureGate from "../components/common/FeatureGate";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ExternalLink, Award, BellRing, CheckCheck, Hourglass, ListChecks } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToClassAssignments,
  createLinkedAssignment,
  deleteLinkedAssignment,
  subscribeToLinkedResult,
  subscribeToMarkAward,
  subscribeToClassAnswerStatus,
  buildLinkedRef,
  type ClassAnswerStatus,
  addMarkForResult,
  addAllMarks,
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

/** Live "who has answered / whose mark is still to add" for every exam and game of the class, without opening them. */
function useClassAnswerStatus(classId: string, assignments: LinkedAssignment[], students: StudentRecord[]) {
  const [status, setStatus] = useState<ClassAnswerStatus | null>(null);
  const refs = assignments.flatMap((a) => students.map((s) => buildLinkedRef(a.id, s.id)));
  const refsKey = refs.join(",");

  useEffect(() => {
    setStatus(null);
    if (!classId) return;
    return subscribeToClassAnswerStatus(classId, refs, setStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, refsKey]);

  /** Counts for one exam/game: null until the first answer arrives. */
  function countsFor(a: LinkedAssignment) {
    if (!status) return null;
    const answeredIds = students.filter((s) => status.answered.has(buildLinkedRef(a.id, s.id)));
    const toMark = status.awardsOk
      ? answeredIds.filter((s) => !status.awarded.has(buildLinkedRef(a.id, s.id))).length
      : answeredIds.length;
    return { answered: answeredIds.length, toMark, total: students.length, awardsOk: status.awardsOk };
  }
  return { ready: status !== null, status, countsFor };
}

/** The indicator on a collapsed exam/game: new answers waiting for marks, nothing yet, or all done. */
function AnswerBadge({ counts }: { counts: ReturnType<ReturnType<typeof useClassAnswerStatus>["countsFor"]> }) {
  const { t } = useTranslation();
  const base = "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold";
  if (!counts) {
    return <span className={`${base} bg-cream-200 text-navy/40`}>{t("linked.badgeChecking", "Checking answers…")}</span>;
  }
  if (counts.toMark > 0) {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 ring-1 ring-amber-300`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <BellRing size={13} />
        {counts.awardsOk
          ? t("linked.badgeToMark", { n: counts.toMark, defaultValue: "{{n}} answered · marks to add" })
          : t("linked.badgeAnswered", { n: counts.answered, defaultValue: "{{n}} answered" })}
        <span className="font-semibold text-amber-700/70">
          {t("linked.badgeOf", { done: counts.answered, total: counts.total, defaultValue: "{{done}}/{{total}}" })}
        </span>
      </span>
    );
  }
  if (counts.answered > 0) {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200`}>
        <CheckCheck size={13} />
        {t("linked.badgeAllMarked", "All marks added")}
      </span>
    );
  }
  return (
    <span className={`${base} bg-cream-200 text-navy/50`}>
      <Hourglass size={12} />
      {t("linked.badgeNone", "No answers yet")}
    </span>
  );
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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState(false);

  if (!ready) return <Spinner />;

  const open = students.filter((s) => !awards[s.id]);
  const done = open.filter((s) => results[s.id]);
  const notYet = open.filter((s) => !results[s.id]);
  const marked = students.length - open.length;

  async function handleAddAllHere() {
    if (bulkBusy || done.length === 0) return;
    setBulkBusy(true);
    setBulkError(false);
    try {
      const r = await addAllMarks({
        classId: assignment.classId,
        assignments: [assignment],
        studentIds: done.map((s) => s.id),
        awardedBy: teacherId,
      });
      if (r.failed > 0) setBulkError(true);
    } catch {
      setBulkError(true);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {open.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-navy/50">{t("linked.progress", { done: done.length, pending: notYet.length })}</p>
          {done.length > 0 && (
            <div className="flex items-center gap-2">
              {bulkError && <span className="text-xs text-red-600">{t("linked.addMarkError")}</span>}
              <button onClick={handleAddAllHere} disabled={bulkBusy} className="btn-gold py-1 px-2.5 text-xs disabled:opacity-60">
                <ListChecks size={13} />
                {bulkBusy ? t("common.loading") : t("linked.addAllHere", { n: done.length, defaultValue: "Add all ({{n}})" })}
              </button>
            </div>
          )}
        </div>
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
  const [allAssignments, setAllAssignments] = useState<LinkedAssignment[]>([]);
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
      setAllAssignments([]);
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubAssignments = subscribeToClassAssignments(
      selectedClassId,
      (data) => {
        setAllAssignments(data);
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
  }, [selectedClassId]);

  const assignments = allAssignments.filter((a) => a.source === source);
  const answerStatus = useClassAnswerStatus(selectedClassId, allAssignments, students);
  // Everything answered across ALL the class's exams and games whose mark hasn't been added yet.
  const pending = (() => {
    const st = answerStatus.status;
    if (!st || !st.awardsOk) return { marks: 0, students: 0, items: [] as LinkedAssignment[] };
    const items: LinkedAssignment[] = [];
    const studentSet = new Set<string>();
    let marks = 0;
    for (const a of allAssignments) {
      let any = false;
      for (const s of students) {
        const ref = buildLinkedRef(a.id, s.id);
        if (st.answered.has(ref) && !st.awarded.has(ref)) {
          marks += 1;
          studentSet.add(s.id);
          any = true;
        }
      }
      if (any) items.push(a);
    }
    return { marks, students: studentSet.size, items };
  })();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkResult, setBulkResult] = useState<{ added: number; failed: number } | "error" | null>(null);

  useEffect(() => setBulkResult(null), [selectedClassId]);

  async function handleAddAll() {
    if (!user || bulkBusy) return;
    setBulkBusy(true);
    setBulkResult(null);
    setBulkProgress({ done: 0, total: pending.marks });
    try {
      const r = await addAllMarks({
        classId: selectedClassId,
        assignments: pending.items,
        studentIds: students.map((s) => s.id),
        awardedBy: user.uid,
        onProgress: (done, total) => setBulkProgress({ done, total }),
      });
      setBulkResult({ added: r.added, failed: r.failed });
    } catch (err) {
      console.error("Add all marks failed", err);
      setBulkResult("error");
    } finally {
      setBulkBusy(false);
      setBulkOpen(false);
    }
  }

  const toMarkBySource = (s: Source) =>
    allAssignments
      .filter((a) => a.source === s)
      .filter((a) => (answerStatus.countsFor(a)?.toMark ?? 0) > 0).length;

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
    <FeatureGate feature="examsGames" notice>
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
            {toMarkBySource(s) > 0 && (
              <span
                className="ms-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-5 text-white"
                title={t("linked.tabToMark", { n: toMarkBySource(s), defaultValue: "{{n}} with answers to mark" })}
              >
                {toMarkBySource(s)}
              </span>
            )}
          </button>
        ))}
      </div>

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {pending.marks > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <BellRing size={16} />
            {t("linked.pendingBanner", {
              marks: pending.marks,
              items: pending.items.length,
              defaultValue: "{{marks}} marks ready to add across {{items}} exams and games",
            })}
          </p>
          <button onClick={() => setBulkOpen(true)} className="btn-gold py-1.5 px-3 text-sm">
            <ListChecks size={15} />
            {t("linked.addAllCount", { n: pending.marks, defaultValue: "Add all marks ({{n}})" })}
          </button>
        </div>
      )}
      {bulkResult && (
        <p
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            bulkResult === "error" || bulkResult.failed > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {bulkResult === "error"
            ? t("linked.addMarkError")
            : bulkResult.failed > 0
            ? t("linked.addAllPartial", { added: bulkResult.added, failed: bulkResult.failed, defaultValue: "Added {{added}} marks · {{failed}} couldn't be added — try again." })
            : t("linked.addAllDone", { added: bulkResult.added, defaultValue: "Added {{added}} marks." })}
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : assignments.length === 0 ? (
        <EmptyState message={t("linked.noAssignments")} />
      ) : (
        <div className="flex flex-col gap-3">
          {assignments.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border bg-white p-4 ${
                (answerStatus.countsFor(a)?.toMark ?? 0) > 0 ? "border-amber-300 border-s-4 border-s-amber-500 shadow-sm" : "border-cream-400"
              }`}
            >
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
                  <AnswerBadge counts={answerStatus.countsFor(a)} />
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

      <Modal open={bulkOpen} onClose={() => !bulkBusy && setBulkOpen(false)} title={t("linked.addAllTitle", "Add all marks for this class?")}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-navy/80">
            {t("linked.addAllBody", {
              marks: pending.marks,
              students: pending.students,
              items: pending.items.length,
              defaultValue:
                "This adds {{marks}} marks for {{students}} students across {{items}} exams and games. Each student's points are updated, and parents get their usual points notification.",
            })}
          </p>
          {bulkBusy && (
            <p className="text-sm font-semibold text-navy">
              {t("linked.addAllRunning", { done: bulkProgress.done, total: bulkProgress.total, defaultValue: "Adding marks… {{done}}/{{total}}" })}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkOpen(false)} disabled={bulkBusy} className="rounded-lg px-4 py-2 text-sm font-semibold text-navy/70 hover:bg-cream-200 disabled:opacity-40">
              {t("common.cancel", "Cancel")}
            </button>
            <button onClick={handleAddAll} disabled={bulkBusy} className="btn-gold px-4 py-2 text-sm disabled:opacity-60">
              <ListChecks size={15} />
              {bulkBusy ? t("common.loading") : t("linked.addAllConfirm", "Add all")}
            </button>
          </div>
        </div>
      </Modal>

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
    </FeatureGate>
  );
}
