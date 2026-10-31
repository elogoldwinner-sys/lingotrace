import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { Check, X, Trash2 } from "lucide-react";
import Spinner from "../../components/common/Spinner";
import { useSchool } from "../../contexts/SchoolContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { detachTeacherClasses, removeMembership, setMembershipStatus } from "../../lib/services/schoolService";
import type { SchoolTeacher } from "../../types";

/** Principal: approve / reject / remove teachers. Department head: the teachers of their subject (read-only). */
export default function SchoolTeachersPage() {
  const { t } = useTranslation();
  const { staff, school } = useSchool();
  const { teachers, classes, loading, reload, audit } = useSchoolData();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const isPrincipal = staff?.role === "principal";

  if (staff?.role !== "principal" && staff?.role !== "departmentHead") return <Navigate to="/school" replace />;
  if (loading) return <Spinner />;

  async function act(m: SchoolTeacher, action: "approve" | "reject" | "remove") {
    if (!school) return;
    if (action === "remove" && !window.confirm(t("sp.confirmRemoveTeacher", { defaultValue: "Remove {{name}} from the school? Their classes will no longer be visible to the school.", name: m.name }))) return;
    setBusyId(m.uid);
    setError("");
    try {
      if (action === "remove") {
        await detachTeacherClasses(school.id, m.uid);
        await removeMembership(m.uid);
        audit("teacher_removed", `${m.name} (${m.subject})`);
      } else {
        await setMembershipStatus(m.uid, action === "approve" ? "approved" : "rejected");
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

  const pending = teachers.filter((m) => m.status === "pending");
  const approved = teachers.filter((m) => m.status === "approved").sort((a, b) => a.name.localeCompare(b.name));
  const countClasses = (uid: string) => classes.filter((c) => c.teacherId === uid).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.teachersTitle", "Teachers")}</h1>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
                  <button className="btn-primary px-3 py-1.5 text-sm" disabled={busyId === m.uid} onClick={() => act(m, "approve")}>
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
                <button className="text-cream-600 hover:text-red-600" disabled={busyId === m.uid} onClick={() => act(m, "remove")} title={t("sp.remove", "Remove")}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
