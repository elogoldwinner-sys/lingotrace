import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Link2, Check, ArrowLeft, ExternalLink } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToClasses } from "../lib/services/classesService";
import { subscribeToStudents } from "../lib/services/studentsService";
import {
  subscribeToProjects,
  createProject,
  deleteProject,
  buildSubmissionUrl,
  isDeadlinePassed,
} from "../lib/services/projectsService";
import {
  subscribeToSubmissionsForProject,
  gradeSubmission,
} from "../lib/services/submissionsService";
import type { ClassRecord, ProjectRecord, StudentRecord, SubmissionRecord } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";
import ClassSelector from "../components/common/ClassSelector";

const DEFAULT_MARK = 10;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);

  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);

  const [gradeStudent, setGradeStudent] = useState<StudentRecord | null>(null);
  const [gradeSubmissionRecord, setGradeSubmissionRecord] = useState<SubmissionRecord | null>(null);
  const [markValue, setMarkValue] = useState(DEFAULT_MARK);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [grading, setGrading] = useState(false);

  const [copiedProjectId, setCopiedProjectId] = useState("");
  const [pageError, setPageError] = useState("");

  /** Turns a raw Firebase error into a message that actually points at the fix, instead of failing silently. Reflects what was actually being attempted, since "load" and "save" failures point at different rule blocks. */
  function describeError(err: unknown, action: "load" | "save" | "delete" = "save"): string {
    const code = (err as { code?: string })?.code;
    if (code === "permission-denied") {
      return t("projects.permissionError", { action: t(`projects.actions.${action}`) });
    }
    return err instanceof Error ? err.message : String(err);
  }

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClasses(
      user.uid,
      (data) => {
        setClasses(data);
        if (!selectedClassId && data.length > 0) setSelectedClassId(data[0].id);
      },
      () => {}
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!selectedClassId) {
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError("");
    const unsubscribe = subscribeToProjects(
      selectedClassId,
      (data) => {
        setProjects(data);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        console.error(error);
        setPageError(describeError(error, "load"));
      }
    );
    return unsubscribe;
  }, [selectedClassId]);

  // Leaving the roster view if the teacher switches classes mid-view.
  useEffect(() => {
    setActiveProject(null);
  }, [selectedClassId]);

  useEffect(() => {
    if (!activeProject) {
      setStudents([]);
      setSubmissions([]);
      return;
    }
    setPageError("");
    const unsubStudents = subscribeToStudents(activeProject.classId, setStudents, (error) => {
      console.error(error);
      setPageError(describeError(error, "load"));
    });
    const unsubSubmissions = subscribeToSubmissionsForProject(
      activeProject.id,
      setSubmissions,
      (error) => {
        console.error(error);
        setPageError(describeError(error, "load"));
      }
    );
    return () => {
      unsubStudents();
      unsubSubmissions();
    };
  }, [activeProject]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedClassId) return;
    setSubmitting(true);
    setPageError("");
    try {
      const newId = await createProject({
        classId: selectedClassId,
        teacherId: user.uid,
        title,
        description,
        deadline,
      });
      // Show it immediately rather than waiting for the live listener to
      // reconcile — the listener will confirm/replace this the moment its
      // next snapshot arrives, with no visible change since the fields
      // already match.
      setProjects((prev) => [
        {
          id: newId,
          classId: selectedClassId,
          teacherId: user.uid,
          title,
          description,
          deadline,
          createdAt: Date.now(),
        },
        ...prev,
      ]);
      setTitle("");
      setDescription("");
      setDeadline(todayISO());
      setCreateModalOpen(false);
    } catch (err) {
      console.error(err);
      setPageError(describeError(err, "save"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteProject(id: string) {
    const previous = projects;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProject?.id === id) setActiveProject(null);
    try {
      await deleteProject(id);
    } catch (err) {
      console.error(err);
      setProjects(previous);
      setPageError(describeError(err, "delete"));
    }
  }

  async function handleCopyLink(project: ProjectRecord) {
    setPageError("");
    try {
      await navigator.clipboard.writeText(buildSubmissionUrl(project.id));
      setCopiedProjectId(project.id);
      setTimeout(() => setCopiedProjectId(""), 2000);
    } catch {
      setPageError(t("classes.inviteError"));
    }
  }

  function openGrade(student: StudentRecord) {
    const submission = submissions.find((s) => s.studentId === student.id) || null;
    setGradeStudent(student);
    setGradeSubmissionRecord(submission);
    setMarkValue(submission?.awardedMark ?? DEFAULT_MARK);
    setFeedbackNote(submission?.teacherNote || "");
  }

  async function handleSaveMark(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !gradeStudent || !gradeSubmissionRecord || !activeProject) return;
    setGrading(true);
    setPageError("");
    try {
      await gradeSubmission({
        submissionId: gradeSubmissionRecord.id,
        studentId: gradeStudent.id,
        classId: activeProject.classId,
        mark: markValue,
        teacherNote: feedbackNote,
        awardedBy: user.uid,
      });
      setGradeStudent(null);
      setGradeSubmissionRecord(null);
    } catch (err) {
      console.error(err);
      setPageError(describeError(err, "save"));
    } finally {
      setGrading(false);
    }
  }

  if (activeProject) {
    const deadlinePassed = isDeadlinePassed(activeProject.deadline);
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setActiveProject(null);
            setPageError("");
          }}
          className="flex items-center gap-1.5 text-sm font-semibold text-navy/70 hover:text-navy"
        >
          <ArrowLeft size={16} />
          {t("projects.backToProjects")}
        </button>

        <div className="card p-5 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-navy">{activeProject.title}</h1>
              {activeProject.description && (
                <p className="text-sm text-cream-600 mt-1">{activeProject.description}</p>
              )}
            </div>
            <button
              onClick={() => handleCopyLink(activeProject)}
              className="btn-secondary text-xs py-2 px-3 shrink-0"
            >
              {copiedProjectId === activeProject.id ? <Check size={14} /> : <Link2 size={14} />}
              {copiedProjectId === activeProject.id ? t("classes.copied") : t("projects.copyLink")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className={`pill ${deadlinePassed ? "bg-red-100 text-red-700" : "bg-gold-50 text-gold"}`}>
              {t("projects.deadlineLabel", { date: activeProject.deadline })}
            </span>
            {deadlinePassed && (
              <span className="pill bg-red-100 text-red-700">{t("projects.deadlinePassedBadge")}</span>
            )}
          </div>
          {pageError && <p className="text-xs text-red-600">{pageError}</p>}
        </div>

        {students.length === 0 ? (
          <EmptyState message={t("students.noStudents")} icon="🧑‍🎓" />
        ) : (
          <div className="card divide-y divide-cream-400">
            {students.map((s) => {
              const submission = submissions.find((sub) => sub.studentId === s.id);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {s.photoURL ? (
                      <img
                        src={s.photoURL}
                        alt={s.name}
                        className="h-10 w-10 rounded-full object-cover border border-gold/40 shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-navy text-cream-100 flex items-center justify-center font-semibold shrink-0">
                        {s.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <p className="font-medium text-navy truncate">{s.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {submission ? (
                      <>
                        <span className="pill bg-green-100 text-green-700">{t("projects.submitted")}</span>
                        {typeof submission.awardedMark === "number" && (
                          <span className="pill bg-gold-50 text-gold">
                            {submission.awardedMark} {t("students.points")}
                          </span>
                        )}
                        <a
                          href={submission.link}
                          target="_blank"
                          rel="noreferrer"
                          title={t("projects.openSubmission")}
                          className="btn-secondary py-1.5 px-2.5 text-xs"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button onClick={() => openGrade(s)} className="btn-gold py-1.5 px-3 text-xs">
                          {typeof submission.awardedMark === "number" ? t("projects.regrade") : t("projects.grade")}
                        </button>
                      </>
                    ) : (
                      <span className="pill bg-red-100 text-red-700">{t("projects.notSubmitted")}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Modal
          open={!!gradeStudent}
          onClose={() => setGradeStudent(null)}
          title={`${t("projects.grade")} — ${gradeStudent?.name || ""}`}
        >
          {gradeSubmissionRecord && (
            <form onSubmit={handleSaveMark} className="space-y-4">
              <div>
                <label className="label-eyebrow block mb-1.5">{t("projects.submissionLinkLabel")}</label>
                <a
                  href={gradeSubmissionRecord.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gold hover:underline break-all"
                >
                  <ExternalLink size={14} className="shrink-0" />
                  {gradeSubmissionRecord.link}
                </a>
              </div>
              {gradeSubmissionRecord.note && (
                <div>
                  <label className="label-eyebrow block mb-1.5">{t("projects.studentNote")}</label>
                  <p className="text-sm text-navy bg-cream-300/50 rounded-lg px-3 py-2">
                    {gradeSubmissionRecord.note}
                  </p>
                </div>
              )}
              <div>
                <label className="label-eyebrow block mb-1.5">{t("projects.mark")}</label>
                <input
                  type="number"
                  value={markValue}
                  onChange={(e) => setMarkValue(Number(e.target.value))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-eyebrow block mb-1.5">{t("projects.feedbackNote")}</label>
                <textarea
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  placeholder={t("projects.feedbackNotePlaceholder")}
                  className="input-field"
                  rows={3}
                />
                <p className="text-xs text-cream-600 mt-1">{t("projects.feedbackNoteHint")}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setGradeStudent(null)} className="btn-secondary">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={grading} className="btn-primary">
                  {t("projects.saveMark")}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy">{t("projects.title")}</h1>
        <button
          onClick={() => setCreateModalOpen(true)}
          disabled={!selectedClassId}
          className="btn-primary disabled:opacity-50"
        >
          <Plus size={16} />
          {t("projects.newProject")}
        </button>
      </div>

      {pageError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {pageError}
        </div>
      )}

      <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={setSelectedClassId} />

      {loading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <EmptyState message={t("projects.noProjects")} icon="📁" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const deadlinePassed = isDeadlinePassed(p.deadline);
            return (
              <div key={p.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => setActiveProject(p)}
                    className="font-semibold text-navy hover:text-gold text-left"
                  >
                    {p.title}
                  </button>
                  <button
                    onClick={() => handleDeleteProject(p.id)}
                    className="text-cream-600 hover:text-red-600 p-1 shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {p.description && <p className="text-sm text-cream-600">{p.description}</p>}
                <span className={`pill w-fit ${deadlinePassed ? "bg-red-100 text-red-700" : "bg-gold-50 text-gold"}`}>
                  {deadlinePassed
                    ? t("projects.deadlinePassedBadge")
                    : t("projects.deadlineLabel", { date: p.deadline })}
                </span>
                <div className="flex gap-2 pt-1 border-t border-cream-400/70 mt-1">
                  <button
                    onClick={() => setActiveProject(p)}
                    className="btn-secondary flex-1 text-xs py-2"
                  >
                    {t("projects.viewSubmissions")}
                  </button>
                  <button
                    onClick={() => handleCopyLink(p)}
                    className="btn-secondary flex-1 text-xs py-2"
                  >
                    {copiedProjectId === p.id ? <Check size={14} /> : <Link2 size={14} />}
                    {copiedProjectId === p.id ? t("classes.copied") : t("projects.copyLink")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={t("projects.newProject")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("projects.projectTitle")}</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("projects.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              rows={3}
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("projects.deadline")}</label>
            <input
              required
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="input-field w-auto"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
