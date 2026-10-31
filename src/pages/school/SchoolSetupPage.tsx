import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSchool } from "../../contexts/SchoolContext";
import { createSchool, setSchoolAssets } from "../../lib/services/schoolService";
import ImageUploadField from "../../components/school/ImageUploadField";
import Spinner from "../../components/common/Spinner";

const SUGGESTED = ["Arabic", "English", "Mathematics", "Science", "Social Studies", "Islamic Studies", "Computer", "Art", "Physical Education"];

/** First step for a principal: the school (name + logo first), its subjects, and optionally the signature and stamp used on printed reports. */
export default function SchoolSetupPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { staff, loading, refresh } = useSchool();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | undefined>();
  const [signature, setSignature] = useState<string | undefined>();
  const [stamp, setStamp] = useState<string | undefined>();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (authLoading || loading) return <div className="flex min-h-screen items-center justify-center bg-cream"><Spinner /></div>;
  if (!user) return <Navigate to="/school-login" replace />;
  if (staff) return <Navigate to="/school" replace />;

  function addSubject(value: string) {
    const v = value.trim();
    if (!v || subjects.some((s) => s.toLowerCase() === v.toLowerCase())) return;
    setSubjects((prev) => [...prev, v]);
    setDraft("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !user.email) return;
    setBusy(true);
    setError("");
    try {
      await createSchool({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || "Principal",
        name,
        logoURL: logo,
        subjects,
      });
      if (signature || stamp) await setSchoolAssets(user.uid, { signatureURL: signature, stampURL: stamp });
      await refresh();
      navigate("/school", { replace: true });
    } catch (err) {
      console.error("School setup failed", err);
      setError(t("sp.setupError", "Couldn't create the school. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-8">
      <form onSubmit={submit} className="card w-full max-w-xl space-y-5 p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-semibold text-navy">{t("sp.setupTitle", "Set up your school")}</h1>
          <p className="mt-1 text-sm text-cream-600">{t("sp.setupSub", "Add your school first. Teachers will then choose it (and their subject) when they sign up, and you approve them.")}</p>
        </div>
        <div>
          <label className="label-eyebrow mb-1.5 block">{t("sp.schoolName", "School name")}</label>
          <input required className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <ImageUploadField label={t("sp.schoolLogo", "School logo")} value={logo} onChange={setLogo} folder="lingotrace/school-logos" round />
        <div>
          <label className="label-eyebrow mb-1.5 block">{t("sp.subjectsList", "Subjects taught at the school")}</label>
          <div className="mb-2 flex flex-wrap gap-2">
            {subjects.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-navy px-3 py-1 text-sm font-semibold text-white">
                {s}
                <button type="button" onClick={() => setSubjects((p) => p.filter((x) => x !== s))}>
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
            <button type="button" className="btn-secondary shrink-0" onClick={() => addSubject(draft)}>
              <Plus size={14} />
              {t("sp.add", "Add")}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED.filter((s) => !subjects.includes(s)).map((s) => (
              <button key={s} type="button" onClick={() => addSubject(s)} className="rounded-full border border-cream-400 bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:border-gold/60">
                + {s}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField label={t("sp.signature", "Principal's signature (optional)")} hint={t("sp.signatureHint", "Printed at the bottom of reports.")} value={signature} onChange={setSignature} folder="lingotrace/school-signatures" />
          <ImageUploadField label={t("sp.stamp", "School stamp (optional)")} hint={t("sp.stampHint", "Printed next to the signature.")} value={stamp} onChange={setStamp} folder="lingotrace/school-stamps" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-between gap-2">
          <Link to="/school-login" className="btn-secondary">
            {t("common.cancel")}
          </Link>
          <button type="submit" disabled={busy || !name.trim()} className="btn-primary disabled:opacity-50">
            {t("sp.createSchoolBtn", "Create school")}
          </button>
        </div>
      </form>
    </div>
  );
}
