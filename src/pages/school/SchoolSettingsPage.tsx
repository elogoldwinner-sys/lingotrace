import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useSchool } from "../../contexts/SchoolContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { setSchoolAssets, updateSchool } from "../../lib/services/schoolService";
import ImageUploadField from "../../components/school/ImageUploadField";

/** Principal only: school identity (name, logo, signature, stamp), approved subjects, and the "compare across subjects" switch. */
export default function SchoolSettingsPage() {
  const { t } = useTranslation();
  const { staff, school, assets, refresh } = useSchool();
  const { audit } = useSchoolData();
  const [name, setName] = useState(school?.name || "");
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  if (staff?.role !== "principal" || !school) return <Navigate to="/school" replace />;
  const sch = school;

  async function run(fn: () => Promise<void>, what: string) {
    setError("");
    try {
      await fn();
      await refresh();
      audit("settings_changed", what);
      setSaved(what);
      setTimeout(() => setSaved(""), 2500);
    } catch (err) {
      console.error("Settings update failed", err);
      setError(t("sp.actionError", "That didn't work. Please try again."));
    }
  }

  const addSubject = (value: string) => {
    const v = value.trim();
    if (!v || sch.subjects.some((s) => s.toLowerCase() === v.toLowerCase())) return;
    setDraft("");
    run(() => updateSchool(sch.id, { subjects: [...sch.subjects, v] }), t("sp.subjectsList", "Subjects"));
  };

  const compareOn = sch.allowSubjectCompare !== false;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.settingsTitle", "School settings")}</h1>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{t("sp.saved", "Saved")}: {saved}</p>}

      <section className="card space-y-4 p-4">
        <div>
          <label className="label-eyebrow mb-1.5 block">{t("sp.schoolName", "School name")}</label>
          <div className="flex gap-2">
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={!name.trim() || name.trim() === sch.name} onClick={() => run(() => updateSchool(sch.id, { name: name.trim() }), t("sp.schoolName", "School name"))}>
              {t("common.save")}
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ImageUploadField
            label={t("sp.schoolLogo", "School logo")}
            value={sch.logoURL}
            round
            folder="lingotrace/school-logos"
            onChange={(url) => run(() => updateSchool(sch.id, { logoURL: url ?? (null as unknown as undefined) }), t("sp.schoolLogo", "School logo"))}
          />
          <ImageUploadField
            label={t("sp.signature", "Principal's signature (optional)")}
            hint={t("sp.signatureHint", "Printed at the bottom of reports.")}
            value={assets.signatureURL}
            folder="lingotrace/school-signatures"
            onChange={(url) => run(() => setSchoolAssets(sch.id, { signatureURL: url }), t("sp.signature", "Signature"))}
          />
          <ImageUploadField
            label={t("sp.stamp", "School stamp (optional)")}
            hint={t("sp.stampHint", "Printed next to the signature.")}
            value={assets.stampURL}
            folder="lingotrace/school-stamps"
            onChange={(url) => run(() => setSchoolAssets(sch.id, { stampURL: url }), t("sp.stamp", "Stamp"))}
          />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="label-eyebrow">{t("sp.subjectsList", "Subjects taught at the school")}</h2>
        <p className="text-xs text-cream-600">{t("sp.subjectsHelp", "Teachers choose their subject from this list. Department heads are matched to teachers by subject, so keep the names consistent.")}</p>
        <div className="flex flex-wrap gap-2">
          {sch.subjects.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white">
              {s}
              <button
                type="button"
                title={t("sp.remove", "Remove")}
                onClick={() => window.confirm(t("sp.confirmRemoveSubject", { defaultValue: "Remove “{{s}}” from the list?", s })) && run(() => updateSchool(sch.id, { subjects: sch.subjects.filter((x) => x !== s) }), t("sp.subjectsList", "Subjects"))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input-field"
            value={draft}
            placeholder={t("sp.addSubjectPlaceholder", "Type a subject and press Add")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSubject(draft);
              }
            }}
          />
          <button className="btn-secondary shrink-0" onClick={() => addSubject(draft)}>
            <Plus size={14} />
            {t("sp.add", "Add")}
          </button>
        </div>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-navy">{t("sp.compareToggleTitle", "Teachers can compare classes across subjects")}</h2>
          <p className="text-xs text-cream-600">{t("sp.compareToggleHelp", "In the teacher portal (Class statistics → Across subjects). When off, teachers no longer see other subjects' points for their class.")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={compareOn}
          onClick={() => run(() => updateSchool(sch.id, { allowSubjectCompare: !compareOn }), t("sp.compareToggleTitle", "Cross-subject comparison"))}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${compareOn ? "bg-green-600" : "bg-cream-500"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${compareOn ? "start-[22px]" : "start-0.5"}`} />
        </button>
      </section>
    </div>
  );
}
