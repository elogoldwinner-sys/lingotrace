import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { Check, X, Trash2, UserRoundCog, Clock } from "lucide-react";
import Modal from "../../components/common/Modal";
import FeatureGate from "../../components/common/FeatureGate";
import Spinner from "../../components/common/Spinner";
import { useLimit, useSchool } from "../../contexts/SchoolContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import {
  detachTeacherClasses,
  listReplacements,
  normEmail,
  removePersonFromSchool,
  replaceTeacher,
  retargetReplacement,
  setMembershipStatus,
  syncClassesToSchool,
} from "../../lib/services/schoolService";
import type { SchoolTeacher, TeacherReplacement } from "../../types";

/** Principal: approve / reject / remove teachers. Department head: the teachers of their subject (read-only). */
export default function SchoolTeachersPage() {
  const { t } = useTranslation();
  const { staff, school } = useSchool();
  const { teachers, classes, loading, reload, audit } = useSchoolData();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const isPrincipal = staff?.role === "principal";
  const maxTeachers = useLimit("maxTeachers");
  // "Replace a teacher": swap a teacher's Gmail for a new teacher's. `target` is either an approved teacher being
  // replaced, or a hand-over still waiting for its new teacher whose Gmail is being corrected.
  const [replacements, setReplacements] = useState<TeacherReplacement[]>([]);
  const [target, setTarget] = useState<{ teacher?: SchoolTeacher; waiting?: TeacherReplacement } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [modalError, setModalError] = useState("");

  const loadReplacements = () => {
    if (!school || staff?.role !== "principal") return;
    listReplacements(school.id).then(setReplacements).catch(() => setReplacements([]));
  };
  useEffect(loadReplacements, [school?.id, staff?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (staff?.role !== "principal" && staff?.role !== "departmentHead") return <Navigate to="/school" replace />;
  if (loading) return <Spinner />;

  async function act(m: SchoolTeacher, action: "approve" | "reject" | "remove") {
    if (!school) return;
    if (action === "remove" && !window.confirm(t("sp.confirmRemoveTeacher", { defaultValue: "Remove {{name}} from the school? Their classes will no longer be visible to the school, and any school-portal role on this Gmail is removed too.", name: m.name }))) return;
    setBusyId(m.uid);
    setError("");
    try {
      if (action === "remove") {
        // Clears the membership AND any school-portal role on the same Gmail, so the person starts from scratch.
        await removePersonFromSchool(school.id, { uid: m.uid, email: m.email });
        audit("teacher_removed", `${m.name} (${m.subject})`);
      } else {
        await setMembershipStatus(m.uid, action === "approve" ? "approved" : "rejected");
        if (action === "approve") await syncClassesToSchool({ ...m, status: "approved" }, school).catch((err) => console.error("Attaching classes failed", err));
        if (action === "reject") await detachTeacherClasses(school.id, m.uid).catch(() => {});
        audit(action === "approve" ? "teacher_approved" : "teacher_rejected", `${m.name} (${m.subject})`);
      }
      await reload();
    } catch (err) {
      console.error("Teacher action failed", err);
      setError(t("sp.actionError", "That didn't work. Please try again."));
    } finally {
      setBusyId("");
    }
  }

  function openReplace(t0: { teacher?: SchoolTeacher; waiting?: TeacherReplacement }) {
    setTarget(t0);
    setNewEmail("");
    setNewName("");
    setModalError("");
  }

  async function submitReplace(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !target) return;
    const mail = normEmail(newEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setModalError(t("classes.invalidEmail", "Enter a valid email address."));
      return;
    }
    const sameAs = target.teacher?.email ?? target.waiting?.email ?? "";
    if (mail === normEmail(sameAs)) {
      setModalError(t("sp.replaceSame", "That is the same Gmail. Enter the new teacher's Gmail."));
      return;
    }
    if (teachers.some((m) => normEmail(m.email) === mail)) {
      setModalError(t("sp.replaceExists", "This Gmail already belongs to a teacher in your school."));
      return;
    }
    setBusyId("replace");
    setModalError("");
    try {
      if (target.teacher) {
        await replaceTeacher({ school, old: target.teacher, newEmail: mail, newName });
        audit("teacher_replaced", `${target.teacher.name} (${target.teacher.subject}) → ${mail}`);
      } else if (target.waiting) {
        await retargetReplacement(school.id, target.waiting, mail);
      }
      setTarget(null);
      loadReplacements();
      await reload();
    } catch (err) {
      console.error("Replacing the teacher failed", err);
      setModalError(t("sp.replaceError", "Couldn't complete this. Check that the feature is enabled for your school and that no other school already uses this Gmail, then try again."));
    } finally {
      setBusyId("");
    }
  }

  const pending = teachers.filter((m) => m.status === "pending");
  const rejected = teachers.filter((m) => m.status === "rejected");
  const approved = teachers.filter((m) => m.status === "approved").sort((a, b) => a.name.localeCompare(b.name));
  const teacherLimitReached = maxTeachers !== null && approved.length >= maxTeachers;
  const countClasses = (uid: string) => classes.filter((c) => c.teacherId === uid).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.teachersTitle", "Teachers")}</h1>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {maxTeachers !== null && (
        <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${teacherLimitReached ? "border-gold/40 bg-gold-50 text-navy" : "border-cream-400 bg-cream-100 text-navy"}`}>
          {t("sp.teacherUsage", "Teachers in your plan")}: {approved.length}/{maxTeachers}
          {teacherLimitReached && isPrincipal && (
            <>
              {" — "}
              {t("sp.teacherLimitReached", "limit reached, you can't approve more teachers.")}{" "}
              <Link to="/school/support?limit=maxTeachers" className="underline">
                {t("feat.requestAccess", "Request access")}
              </Link>
            </>
          )}
        </p>
      )}

      {isPrincipal && (
        <section className="space-y-2">
          <h2 className="label-eyebrow">{t("sp.pendingRequests", "Waiting for your approval")}</h2>
          {pending.length === 0 ? (
            <div className="card p-4 text-sm text-cream-600">{t("sp.noPending", "No pending requests.")}</div>
          ) : (
            pending.map((m) => (
              <div key={m.uid} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-navy">{m.name}</p>
                  <p className="text-xs text-cream-600" dir="ltr">{m.email}</p>
                  <p className="mt-1 text-sm text-navy">
                    {t("sp.subject", "Subject")}: <b>{m.subject}</b> · {t("sp.classesCount", { defaultValue: "{{n}} class(es)", n: Object.keys(m.classMap || {}).length })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary px-3 py-1.5 text-sm disabled:cursor-not-allowed" disabled={busyId === m.uid || teacherLimitReached} title={teacherLimitReached ? t("sp.teacherLimitReached", "limit reached, you can't approve more teachers.") : undefined} onClick={() => act(m, "approve")}>
                    <Check size={14} />
                    {t("sp.approve", "Approve")}
                  </button>
                  <button className="btn-secondary px-3 py-1.5 text-sm" disabled={busyId === m.uid} onClick={() => act(m, "reject")}>
                    <X size={14} />
                    {t("sp.reject", "Reject")}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {isPrincipal && rejected.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-eyebrow">{t("sp.rejectedTeachers", "Rejected requests")}</h2>
          {rejected.map((m) => (
            <div key={m.uid} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-navy">{m.name}</p>
                <p className="text-xs text-cream-600" dir="ltr">{m.email}</p>
              </div>
              <button className="text-cream-600 hover:text-red-600" disabled={busyId === m.uid} onClick={() => act(m, "remove")} title={t("sp.remove", "Remove")}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="label-eyebrow">{t("sp.approvedTeachers", "Teachers in the school")}</h2>
        {approved.length === 0 ? (
          <div className="card p-4 text-sm text-cream-600">{t("sp.noTeachers", "No approved teachers yet.")}</div>
        ) : (
          approved.map((m) => (
            <div key={m.uid} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-navy">{m.name}</p>
                <p className="text-xs text-cream-600" dir="ltr">{m.email}{m.whatsapp ? ` · ${m.whatsapp}` : ""}</p>
                <p className="mt-1 text-sm text-navy">
                  {m.subject} · {t("sp.classesCount", { defaultValue: "{{n}} class(es)", n: countClasses(m.uid) })}
                </p>
              </div>
              {isPrincipal && (
                <div className="flex items-center gap-3">
                  <FeatureGate feature="teacherReplacement" as="span">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-gold-50"
                      disabled={busyId === m.uid}
                      onClick={() => openReplace({ teacher: m })}
                    >
                      <UserRoundCog size={14} />
                      {t("sp.replaceTeacher", "Replace teacher")}
                    </button>
                  </FeatureGate>
                  <button className="text-cream-600 hover:text-red-600" disabled={busyId === m.uid} onClick={() => act(m, "remove")} title={t("sp.remove", "Remove")}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {isPrincipal && replacements.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-eyebrow">{t("sp.waitingReplacements", "Waiting for the new teacher to sign in")}</h2>
          {replacements.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="flex items-center gap-1.5 font-semibold text-navy">
                  <Clock size={14} className="text-gold" />
                  <span dir="ltr">{r.email}</span>
                </p>
                <p className="mt-1 text-sm text-navy">
                  {t("sp.replacingInfo", { defaultValue: "Takes over from {{old}} · {{subject}} · {{n}} class(es)", old: r.oldName, subject: r.subject, n: r.classCount })}
                </p>
              </div>
              <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => openReplace({ waiting: r })}>
                {t("sp.changeEmail", "Change Gmail")}
              </button>
            </div>
          ))}
        </section>
      )}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.waiting ? t("sp.changeEmail", "Change Gmail") : t("sp.replaceTeacher", "Replace teacher")}
        widthClassName="max-w-lg"
      >
        <form onSubmit={submitReplace} className="space-y-4">
          <p className="text-sm text-cream-600">
            {target?.waiting
              ? t("sp.changeEmailHelp", "The new teacher hasn't signed in yet. Enter the correct Gmail and the waiting classes will go to it instead.")
              : t("sp.replaceHelp", {
                  defaultValue: "{{name}} is removed from the school and their classes — with all students, marks and attendance — go to the Gmail below. When the new teacher signs in with it they become the teacher of these classes for {{subject}}, with no further approval.",
                  name: target?.teacher?.name || "",
                  subject: target?.teacher?.subject || "",
                })}
          </p>
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("sp.newTeacherGmail", "New teacher's Gmail")}</label>
            <input required type="email" dir="ltr" className="input-field" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@gmail.com" />
          </div>
          {target?.teacher && (
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.nameOptional", "Name (optional)")}</label>
              <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
          )}
          {modalError && <p className="text-sm text-red-600">{modalError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setTarget(null)}>
              {t("common.cancel", "Cancel")}
            </button>
            <button type="submit" disabled={busyId === "replace"} className="btn-primary">
              {target?.waiting ? t("common.save", "Save") : t("sp.replaceConfirm", "Replace")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
