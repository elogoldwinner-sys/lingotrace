import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus, Trash2, Link2, Check, UserPlus, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  subscribeToClassesAndSubjects,
  createClass,
  deleteClass,
  addSubjectTeacher,
  syncSubjectStudents,
  claimPendingSubjects,
  normalizeEmail,
} from "../lib/services/classesService";
import { subscribeToStudentCounts } from "../lib/services/studentsService";
import { getOrCreateInvite, buildInviteUrl } from "../lib/services/invitesService";
import type { ClassRecord } from "../types";
import Modal from "../components/common/Modal";
import EmptyState from "../components/common/EmptyState";
import Spinner from "../components/common/Spinner";

export default function ClassesPage() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [inviteError, setInviteError] = useState("");

  // "Add teacher" (subject co-teacher) form
  const [teacherForClass, setTeacherForClass] = useState<ClassRecord | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherError, setTeacherError] = useState("");
  const [teacherSubmitting, setTeacherSubmitting] = useState(false);
  const [syncMessage, setSyncMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToClassesAndSubjects(
      user.uid,
      (data) => {
        setClasses(data);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    const classIds = classes.map((c) => c.id);
    const unsubscribe = subscribeToStudentCounts(classIds, setStudentCounts, console.error);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.map((c) => c.id).join(",")]);

  // Classes this teacher teaches (their own, plus subjects they were added to) vs. subject classes they handed to co-teachers.
  const myClasses = classes.filter((c) => c.teacherId === user?.uid);
  const givenSubjects = classes.filter((c) => c.ownerId === user?.uid && c.teacherId !== user?.uid);

  function openAddTeacher(c: ClassRecord) {
    setTeacherForClass(c);
    setSubjectName("");
    setTeacherEmail("");
    setTeacherError("");
  }

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !teacherForClass) return;
    const email = normalizeEmail(teacherEmail);
    if (!/^[^\s@]+@gmail\.com$/.test(email)) {
      setTeacherError(t("classes.invalidEmail"));
      return;
    }
    const subject = subjectName.trim();
    const duplicate = givenSubjects.some(
      (g) =>
        g.parentClassId === teacherForClass.id &&
        g.teacherEmail === email &&
        (g.subject || "").toLowerCase() === subject.toLowerCase()
    );
    if (duplicate) {
      setTeacherError(t("classes.duplicateTeacher"));
      return;
    }
    setTeacherSubmitting(true);
    setTeacherError("");
    try {
      await addSubjectTeacher({
        mainClass: teacherForClass,
        subject,
        teacherEmail: email,
        ownerId: user.uid,
        ownerName: profile?.displayName || user.displayName || "",
      });
      // Adding yourself as the teacher of another subject: claim it right away.
      if (email === normalizeEmail(user.email || "")) await claimPendingSubjects(user.uid, user.email);
      setTeacherForClass(null);
    } catch {
      setTeacherError(t("classes.addTeacherError"));
    } finally {
      setTeacherSubmitting(false);
    }
  }

  async function handleSync(c: ClassRecord) {
    try {
      const added = await syncSubjectStudents(c);
      setSyncMessage((prev) => ({
        ...prev,
        [c.id]: added > 0 ? t("classes.syncDone", { count: added }) : t("classes.syncNone"),
      }));
      setTimeout(() => setSyncMessage((prev) => ({ ...prev, [c.id]: "" })), 4000);
    } catch {
      setInviteError(t("classes.addTeacherError"));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      await createClass({ name, description, teacherId: user.uid });
      setName("");
      setDescription("");
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteClass(id);
  }

  async function handleCopyInvite(classItem: ClassRecord) {
    if (!user) return;
    setInviteError("");
    try {
      const invite = await getOrCreateInvite(classItem.id, classItem.name, "parent", user.uid);
      await navigator.clipboard.writeText(buildInviteUrl(invite.id));
      setCopiedKey(classItem.id);
      setTimeout(() => setCopiedKey(""), 2000);
    } catch {
      setInviteError(t("classes.inviteError"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy">{t("classes.title")}</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus size={16} />
          {t("classes.newClass")}
        </button>
      </div>

      {inviteError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {inviteError}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : myClasses.length === 0 && givenSubjects.length === 0 ? (
        <EmptyState message={t("classes.noClasses")} icon="📚" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {myClasses.map((c) => {
            const subjectsHere = givenSubjects.filter((g) => g.parentClassId === c.id);
            const isSubjectOfOther = !!c.parentClassId && c.ownerId !== user?.uid;
            return (
            <div key={c.id} className="card p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    to={`/students?classId=${c.id}`}
                    className="font-semibold text-navy hover:text-gold"
                  >
                    {c.name}
                  </Link>
                  {c.description && (
                    <p className="text-sm text-cream-600 mt-1">{c.description}</p>
                  )}
                  {c.subject && (
                    <p className="text-xs text-cream-600 mt-1">
                      {t("classes.subjectBadge", { subject: c.subject })}
                      {isSubjectOfOther && c.ownerName ? ` · ${t("classes.sharedBy", { owner: c.ownerName })}` : ""}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-cream-600 hover:text-red-600 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <span className="pill bg-gold-50 text-gold w-fit">
                {studentCounts[c.id] || 0} {t("classes.students")}
              </span>
              <div className="flex gap-2 pt-1 border-t border-cream-400/70 mt-1">
                <button
                  onClick={() => handleCopyInvite(c)}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  {copiedKey === c.id ? <Check size={14} /> : <Link2 size={14} />}
                  {copiedKey === c.id ? t("classes.copied") : t("classes.parentInvite")}
                </button>
                {isSubjectOfOther ? (
                  <button onClick={() => handleSync(c)} className="btn-secondary flex-1 text-xs py-2">
                    <RefreshCw size={14} />
                    {t("classes.syncStudents")}
                  </button>
                ) : (
                  !c.parentClassId && (
                    <button onClick={() => openAddTeacher(c)} className="btn-secondary flex-1 text-xs py-2">
                      <UserPlus size={14} />
                      {t("classes.addTeacher")}
                    </button>
                  )
                )}
              </div>
              {syncMessage[c.id] && <p className="text-xs text-cream-600">{syncMessage[c.id]}</p>}
              {subjectsHere.length > 0 && (
                <div className="space-y-1.5 border-t border-cream-400/70 pt-2">
                  <p className="label-eyebrow">{t("classes.subjectsTitle")}</p>
                  {subjectsHere.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-2 text-xs text-navy">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{g.subject}</span> · {g.teacherEmail}
                      </span>
                      {g.teacherId ? (
                        <span className="pill bg-green-100 text-green-700 shrink-0">{t("classes.active")}</span>
                      ) : (
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="pill bg-gold-50 text-gold">{t("classes.pending")}</span>
                          <button
                            onClick={() => deleteClass(g.id)}
                            className="text-cream-600 hover:text-red-600"
                            title={t("classes.removePending")}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("classes.newClass")}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">{t("classes.className")}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("classes.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!teacherForClass}
        onClose={() => setTeacherForClass(null)}
        title={t("classes.addTeacherTitle")}
      >
        <form onSubmit={handleAddTeacher} className="space-y-4">
          <p className="text-sm text-cream-600">{teacherForClass?.name}</p>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("classes.subjectName")}</label>
            <input
              required
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder={t("classes.subjectPlaceholder")}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">{t("classes.teacherGmail")}</label>
            <input
              required
              type="email"
              dir="ltr"
              value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
              placeholder="name@gmail.com"
              className="input-field"
            />
            <p className="text-xs text-cream-600 mt-1.5">{t("classes.addTeacherHint")}</p>
          </div>
          {teacherError && <p className="text-sm text-red-600">{teacherError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTeacherForClass(null)} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={teacherSubmitting} className="btn-primary">
              {t("classes.addTeacher")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
