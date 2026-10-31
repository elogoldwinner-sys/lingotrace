import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "../../components/common/Modal";
import Spinner from "../../components/common/Spinner";
import ScopePicker, { scopeSummary, type Scope } from "../../components/school/ScopePicker";
import { useSchool } from "../../contexts/SchoolContext";
import { useAuth } from "../../contexts/AuthContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { listStaff, normEmail, removeStaffAccess, saveStaffAccess, updateStaffScope } from "../../lib/services/schoolService";
import type { StaffAccess, StaffRole } from "../../types";

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
    active ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
  }`;

const EMPTY: Scope = { allClasses: false, grades: [], classKeys: [] };

/**
 * Principal: adds department heads (by email + subject) and the school counselor (by email + classes/grades).
 * Department head: adds supervisors / coordinators (by email + job title) and limits them to grades / classes of their subject.
 */
export default function SchoolStaffPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { staff, school } = useSchool();
  const { classes } = useSchoolData();
  const isPrincipal = staff?.role === "principal";
  const [list, setList] = useState<StaffAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffAccess | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>(isPrincipal ? "departmentHead" : "supervisor");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<Scope>(EMPTY);
  const [busy, setBusy] = useState(false);

  const classKeys = useMemo(
    () => Array.from(new Set(classes.map((c) => c.classKey || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [classes]
  );

  async function load() {
    if (!school || !user) return;
    setLoading(true);
    try {
      const rows = await listStaff(school.id, isPrincipal ? undefined : user.uid);
      setList(rows.filter((r) => r.role !== "principal").sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email)));
    } catch (err) {
      console.error("Couldn't load staff", err);
      setError(t("sp.loadError", "Couldn't load the schools. Please try again."));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id, user?.uid]);

  if (!staff || (staff.role !== "principal" && staff.role !== "departmentHead") || !school) return <Navigate to="/school" replace />;

  const roleChoices: StaffRole[] = isPrincipal ? ["departmentHead", "counselor"] : ["supervisor", "coordinator"];
  const needsScope = role !== "departmentHead";

  function openNew() {
    setEditing(null);
    setEmail("");
    setName("");
    setTitle("");
    setSubject(staff?.role === "departmentHead" ? staff.subject || "" : "");
    setRole(isPrincipal ? "departmentHead" : "supervisor");
    setScope(EMPTY);
    setError("");
    setOpen(true);
  }

  function openEdit(a: StaffAccess) {
    setEditing(a);
    setEmail(a.email);
    setName(a.displayName || "");
    setTitle(a.jobTitle || "");
    setRole(a.role);
    setSubject(a.subject || "");
    setScope({ allClasses: !!a.allClasses, grades: a.grades || [], classKeys: a.classKeys || [] });
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !user || !staff) return;
    const mail = normEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError(t("classes.invalidEmail"));
      return;
    }
    if ((role === "departmentHead" || role === "supervisor" || role === "coordinator") && !subject) {
      setError(t("sp.pickSubject", "Choose a subject."));
      return;
    }
    if (needsScope && !scope.allClasses && scope.grades.length === 0 && scope.classKeys.length === 0) {
      setError(t("sp.pickScope", "Choose at least one grade or class."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const scopeFields = needsScope
        ? { allClasses: scope.allClasses, grades: scope.allClasses ? [] : scope.grades, classKeys: scope.allClasses ? [] : scope.classKeys }
        : { allClasses: false, grades: [], classKeys: [] };
      if (editing) {
        await updateStaffScope(mail, {
          jobTitle: title.trim() || undefined,
          displayName: name.trim() || undefined,
          ...(role !== "counselor" ? { subject } : {}),
          ...scopeFields,
        });
      } else {
        await saveStaffAccess({
          email: mail,
          schoolId: school.id,
          role,
          jobTitle: title.trim() || undefined,
          displayName: name.trim() || undefined,
          ...(role !== "counselor" ? { subject } : {}),
          ...scopeFields,
          addedByUid: user.uid,
          addedByRole: staff.role,
        });
      }
      setOpen(false);
      await load();
    } catch (err) {
      console.error("Saving staff failed", err);
      setError(t("sp.staffSaveError", "Couldn't save. This Gmail may already be used for another school role."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: StaffAccess) {
    if (!window.confirm(t("sp.confirmRemoveStaff", { defaultValue: "Remove {{email}}?", email: a.email }))) return;
    try {
      await removeStaffAccess(a.email);
      await load();
    } catch {
      setError(t("sp.actionError", "That didn't work. Please try again."));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">{t("sp.staffTitle", "Staff")}</h1>
          <p className="text-sm text-cream-600">
            {isPrincipal
              ? t("sp.staffSubPrincipal", "Add department heads (with their subject) and the school counselor. They sign in with the Gmail you enter.")
              : t("sp.staffSubHead", "Add supervisors or coordinators for your subject and choose the grades or classes they can see.")}
          </p>
        </div>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} />
          {t("sp.addStaff", "Add staff")}
        </button>
      </div>
      {error && !open && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <div className="card p-6 text-center text-sm text-cream-600">{t("sp.noStaff", "No staff added yet.")}</div>
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-navy">
                  {a.displayName || a.email} <span className="pill ms-1 bg-gold-50 text-gold">{a.jobTitle || t(`sp.role.${a.role}`, a.role)}</span>
                </p>
                <p className="text-xs text-cream-600" dir="ltr">{a.email}</p>
                <p className="mt-1 text-sm text-navy">
                  {a.subject ? `${a.subject} · ` : ""}
                  {a.role === "departmentHead" ? t("sp.allClassesOfSubject", "All classes of the subject") : scopeSummary(a, (k, d) => t(k, d))}
                </p>
              </div>
              <div className="flex gap-3">
                <button className="text-cream-600 hover:text-navy" onClick={() => openEdit(a)} title={t("common.edit", "Edit")}>
                  <Pencil size={16} />
                </button>
                <button className="text-cream-600 hover:text-red-600" onClick={() => remove(a)} title={t("sp.remove", "Remove")}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t("sp.editStaff", "Edit staff") : t("sp.addStaff", "Add staff")} widthClassName="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("sp.jobTitleLabel", "Job title")}</label>
            <div className="flex flex-wrap gap-2">
              {roleChoices.map((r) => (
                <button key={r} type="button" disabled={!!editing} className={`${chip(role === r)} disabled:opacity-60`} onClick={() => setRole(r)}>
                  {t(`sp.role.${r}`, r)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-eyebrow mb-1.5 block">Gmail</label>
              <input required type="email" dir="ltr" disabled={!!editing} className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
            </div>
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.nameOptional", "Name (optional)")}</label>
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          {role !== "counselor" && (
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.subject", "Subject")}</label>
              {isPrincipal ? (
                <div className="flex flex-wrap gap-2">
                  {school.subjects.map((s) => (
                    <button key={s} type="button" className={chip(subject === s)} onClick={() => setSubject(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-cream-100 px-3 py-2 text-sm font-semibold text-navy">{staff.subject}</p>
              )}
            </div>
          )}
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("sp.customTitle", "Custom title (optional)")}</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("sp.customTitlePh", "e.g. Grade 5 coordinator")} />
          </div>
          {needsScope && (
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.scope", "Which classes can they see?")}</label>
              <ScopePicker
                value={scope}
                onChange={setScope}
                classKeys={classKeys}
                allLabel={isPrincipal ? t("sp.scopeAll", "All classes") : t("sp.scopeAllMine", "All classes of my subject")}
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={busy} className="btn-primary">
              {t("common.save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
