import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Trash2, ExternalLink } from "lucide-react";
import FeatureGate from "../common/FeatureGate";
import Switch from "../common/Switch";
import { uploadToCloudinary } from "../../lib/cloudinary";
import { LETTERHEAD_MAX_MB, newLetterhead } from "../../lib/letterhead";
import type { SchoolLetterhead } from "../../types";

/**
 * Principal: upload the school's letterhead (PDF) and say how much blank space it needs. Every printed report is then
 * placed on it. Switched on per school by the platform admin ("letterhead" feature) — faded and inactive without it.
 */
export default function LetterheadCard({
  value,
  onSave,
}: {
  value: SchoolLetterhead | null;
  /** Saves the letterhead (null removes it). */
  onSave: (next: SchoolLetterhead | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [top, setTop] = useState(value?.topMm ?? 45);
  const [bottom, setBottom] = useState(value?.bottomMm ?? 25);
  const [side, setSide] = useState(value?.sideMm ?? 15);

  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Math.round(n) || 0));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (err) {
      console.error("Letterhead update failed", err);
      setError(t("lh.error", "Couldn't upload the letterhead. If it keeps failing, the upload settings may not allow PDF files."));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError(t("lh.onlyPdf", "Please choose a PDF file."));
      return;
    }
    if (file.size > LETTERHEAD_MAX_MB * 1024 * 1024) {
      setError(t("lh.tooBig", { defaultValue: "The file is larger than {{mb}} MB.", mb: LETTERHEAD_MAX_MB }));
      return;
    }
    await run(async () => {
      const result = await uploadToCloudinary(file, "lingotrace/school-letterheads");
      const fresh = newLetterhead(result.secure_url);
      // Keep the margins and on/off choice when replacing the PDF.
      await onSave(value ? { ...fresh, topMm: value.topMm, bottomMm: value.bottomMm, sideMm: value.sideMm, enabled: value.enabled } : fresh);
    });
  }

  const preview = value && (
    <div className="mx-auto w-full max-w-[16rem]">
      <p className="label-eyebrow mb-1">{t("lh.preview", "Preview (A4)")}</p>
      <div className="relative aspect-[210/297] w-full overflow-hidden rounded border border-cream-400 bg-white shadow-sm">
        <img src={value.imageUrl} alt="" className="h-full w-full object-fill" />
        {/* The blank space reserved for the letterhead's own header / footer / sides. */}
        <div className="absolute inset-x-0 top-0 bg-red-500/15" style={{ height: `${(top / 297) * 100}%` }} />
        <div className="absolute inset-x-0 bottom-0 bg-red-500/15" style={{ height: `${(bottom / 297) * 100}%` }} />
        <div className="absolute inset-y-0 start-0 bg-red-500/15" style={{ width: `${(side / 210) * 100}%` }} />
        <div className="absolute inset-y-0 end-0 bg-red-500/15" style={{ width: `${(side / 210) * 100}%` }} />
      </div>
    </div>
  );

  const num = (label: string, v: number, set: (n: number) => void, max: number) => (
    <label className="text-xs font-semibold text-cream-700">
      {label}
      <input type="number" min={0} max={max} value={v} onChange={(e) => set(clamp(Number(e.target.value), max))} className="input-field mt-0.5 block w-24" />
    </label>
  );

  return (
    <FeatureGate feature="letterhead" notice>
      <section className="card space-y-4 p-4">
        <div>
          <h2 className="font-semibold text-navy">{t("lh.title", "School letterhead")}</h2>
          <p className="text-sm text-cream-600">
            {t("lh.intro", "Upload your school's letterhead as a PDF. Every printed report — from you and from your teachers — is then placed on it automatically.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={`btn-primary cursor-pointer ${busy ? "opacity-60" : ""}`}>
            <FileUp size={16} />
            {busy ? t("lh.uploading", "Uploading…") : value ? t("lh.replace", "Replace the PDF") : t("lh.upload", "Upload letterhead (PDF)")}
            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {value && (
            <>
              <a href={value.pdfUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-1.5 py-2 text-sm">
                <ExternalLink size={15} />
                {t("lh.openPdf", "Open the PDF")}
              </a>
              <button type="button" disabled={busy} onClick={() => run(() => onSave(null))} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline">
                <Trash2 size={15} />
                {t("lh.remove", "Remove")}
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-cream-600">{t("lh.firstPageOnly", "Only the first page of the PDF is used, and it is stretched to A4.")}</p>

        {!value ? (
          <p className="text-sm text-cream-600">{t("lh.none", "No letterhead uploaded yet.")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-[16rem_1fr]">
            {preview}
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-navy">
                <Switch checked={value.enabled} onChange={(on) => run(() => onSave({ ...value, enabled: on }))} label={t("lh.enabled", "Use the letterhead on printed reports")} />
                {t("lh.enabled", "Use the letterhead on printed reports")}
              </div>
              <div>
                <p className="label-eyebrow mb-1">{t("lh.margins", "Blank space for the letterhead (mm)")}</p>
                <div className="flex flex-wrap gap-3">
                  {num(t("lh.top", "Top"), top, setTop, 120)}
                  {num(t("lh.bottom", "Bottom"), bottom, setBottom, 120)}
                  {num(t("lh.side", "Sides"), side, setSide, 60)}
                </div>
                <p className="mt-2 text-xs text-cream-600">{t("lh.marginsHint", "The report starts below the top space and stops above the bottom space on every page, so it never covers your header or footer. The shaded areas in the preview show it.")}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => run(() => onSave({ ...value, topMm: top, bottomMm: bottom, sideMm: side }))} className="btn-secondary py-2 text-sm">
                {t("lh.save", "Save margins")}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm font-semibold text-green-700">{t("lh.saved", "Letterhead saved.")}</p>}
      </section>
    </FeatureGate>
  );
}
