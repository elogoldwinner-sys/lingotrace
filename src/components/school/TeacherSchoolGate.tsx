import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Building2, Clock, AlertTriangle } from "lucide-react";
import Modal from "../common/Modal";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useSchool } from "../../contexts/SchoolContext";
import { listSchools, requestMembership } from "../../lib/services/schoolService";
import { GRADES, SECTIONS, guessGradeSection } from "../../lib/school/scope";
import type { ClassRecord, School } from "../../types";

/**
 * Teacher side of the school feature: on the first sign-in after this
 * update (or for a new teacher) it asks which school and subject the teacher
 * belongs to, and which grade/section each existing class is. The request
 * stays "pending" until the school principal approves it. Shows a small
 * status banner while waiting / after a rejection.
 */
export default function TeacherSchoolGate() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const { membership, school, loading, refresh } = useSchool();
  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [subject, setSubject] = useState("");
  const [map, setMap] = useState<Record<string, { grade?: number; section?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsSetup = !!profile && !loading && (!membership || membership.status === "rejected");
  const skipKey = user ? `lt-school-skip:${user.uid}` : "";

  // Ask once per browser session; the banner below keeps the reminder visible after "Later".
  useEffect(() => {
    if (needsSetup && skipKey && !sessionStorage.getItem(skipKey)) setOpen(true);
  }, [needsSetup, skipKey]);

  useEffect(() => {
    if (!open || !user) return;
    listSchools().then(setSchools).catch(() => setError(t("sp.loadError", "Couldn't load the schools. Please try again.")));
    getDocs(query(collection(db, "classes"), where("teacherId", "==", user.uid)))
      .then((snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as ClassRecord), id: d.id }));
        setClasses(list);
        const initial: Record<string, { grade?: number; section?: string }> = {};
        list.forEach((c) => {
          initial[c.id] = c.grade != null && c.section ? { grade: c.grade, section: c.section } : guessGradeSection(c.name);
        });
        setMap(initial);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const chosen = useMemo(() => schools.find((s) => s.id === schoolId) || null, [schools, schoolId]);
  const allMapped = classes.every((c) => map[c.id]?.grade && map[c.id]?.section);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile || !chosen) return;
    setBusy(true);
    setError("");
    try {
      const classMap: Record<string, { grade: number; section: string }> = {};
      classes.forEach((c) => {
        const m = map[c.id];
        if (m?.grade && m.section) classMap[c.id] = { grade: m.grade, section: m.section };
      });
      await requestMembership({
        uid: user.uid,
        schoolId: chosen.id,
        name: profile.displayName,
        email: user.email || profile.email,
        whatsapp: profile.whatsappNumber,
        subject,
        classMap,
      });
      await refresh();
      setOpen(false);
    } catch (err) {
      console.error("School request failed", err);
      setError(t("sp.requestError", "Couldn't send your request. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function later() {
    if (skipKey) sessionStorage.setItem(skipKey, "1");
    setOpen(false);
  }

  const banner = (() => {
    if (!profile || loading) return null;
    if (membership?.status === "pending") {
      return (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-gold/40 bg-gold-50 px-3 py-2 text-sm font-semibold text-navy">
          <Clock size={16} className="shrink-0" />
          {t("sp.pendingBanner", { defaultValue: "Your request to join {{school}} is waiting for the principal's approval.", school: school?.name || "" })}
        </div>
      );
    }
    if (needsSetup) {
      return (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-50 px-3 py-2 text-sm font-semibold text-navy">
          <span className="flex items-center gap-2">
            {membership?.status === "rejected" ? <AlertTriangle size={16} /> : <Building2 size={16} />}
            {membership?.status === "rejected"
              ? t("sp.rejectedBanner", "Your school request was not approved. You can choose a school again.")
              : t("sp.joinBanner", "Join your school so your principal and department head can see your classes.")}
          </span>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
            {t("sp.joinSchool", "Join a school")}
          </button>
        </div>
      );
    }
    return null;
  })();

  return (
    <>
      {banner}
      <Modal open={open} onClose={later} title={t("sp.joinTitle", "Join your school")} widthClassName="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-cream-600">
            {t("sp.joinHelp", "Choose your school and subject. Your school principal will approve your request. Your classes and students stay exactly as they are.")}
          </p>
          <div>
            <label className="label-eyebrow mb-1.5 block">{t("sp.school", "School")}</label>
            <select
              required
              className="input-field w-full"
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setSubject("");
              }}
            >
              <option value="">{t("sp.chooseSchool", "Choose your school…")}</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {schools.length === 0 && !error && <p className="mt-1 text-xs text-cream-600">{t("sp.noSchools", "No school has been created yet. Ask your principal to create it first.")}</p>}
          </div>
          {chosen && (
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.subject", "Subject")}</label>
              <div className="flex flex-wrap gap-2">
                {chosen.subjects.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubject(s)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      subject === s ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {chosen.subjects.length === 0 && <p className="mt-1 text-xs text-red-600">{t("sp.noSubjects", "This school has no subjects yet. Ask your principal to add them.")}</p>}
            </div>
          )}
          {classes.length > 0 && (
            <div>
              <label className="label-eyebrow mb-1.5 block">{t("sp.yourClasses", "Your classes — grade and section")}</label>
              <div className="space-y-2">
                {classes.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-cream-400 bg-white p-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{c.name}</span>
                    <select
                      required
                      className="input-field w-auto"
                      value={map[c.id]?.grade ?? ""}
                      onChange={(e) => setMap((m) => ({ ...m, [c.id]: { ...m[c.id], grade: Number(e.target.value) || undefined } }))}
                    >
                      <option value="">{t("sp.grade", "Grade")}</option>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <select
                      required
                      className="input-field w-auto"
                      value={map[c.id]?.section ?? ""}
                      onChange={(e) => setMap((m) => ({ ...m, [c.id]: { ...m[c.id], section: e.target.value || undefined } }))}
                    >
                      <option value="">{t("sp.section", "Section")}</option>
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={later} className="btn-secondary">
              {t("sp.later", "Later")}
            </button>
            <button type="submit" disabled={busy || !chosen || !subject || !allMapped} className="btn-primary disabled:opacity-50">
              {t("sp.sendRequest", "Send request")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
