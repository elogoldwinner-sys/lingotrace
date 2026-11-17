import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileUp, Trash2 } from "lucide-react";
import Switch from "../common/Switch";
import { uploadToCloudinary } from "../../lib/cloudinary";
import {
  DEFAULT_TEXT_COLOR,
  loadCorsImage,
  renderGuideCanvas,
  renderTemplateCanvas,
  templateImageUrl,
  type Orientation,
} from "../../lib/certificate/template";
import type { CertificateTemplate } from "../../types";

const MAX_MB = 15;
const A4_RATIO = 297 / 210;

/**
 * Principal: put the school's own certificate design in place. The platform sets the standard (fixed zones for the
 * student's name, reason, points, rank, badges, signatures, stamp, date and the LingoTrace logo) and offers a guide the
 * designer works against; the school supplies the artwork. Every certificate teachers issue can then be drawn on it.
 */
export default function CertificateTemplateCard({
  value,
  onSave,
}: {
  value: CertificateTemplate | null;
  /** Saves the template (null removes it). */
  onSave: (next: CertificateTemplate | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [preview, setPreview] = useState("");

  const imageUrl = value?.imageUrl;
  const orientation = value?.orientation;
  const labelLang = value?.labelLang;
  const textColor = value?.textColor;

  // Live preview with sample data, so the principal sees exactly how a certificate will look.
  useEffect(() => {
    if (!imageUrl || !orientation || !labelLang) {
      setPreview("");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const ar = labelLang === "ar";
        const canvas = await renderTemplateCanvas(
          {
            studentName: ar ? "عبدالله محمد الغامدي" : "Alexander Johnson",
            reason: ar ? "التميّز في المشاركة الصفية والسلوك الحسن" : "Outstanding participation and excellent behaviour",
            points: 128,
            rank: 2,
            classSize: 28,
            badges: [
              { icon: "🌟", name: ar ? "مشارك متميز" : "Star Participant" },
              { icon: "📚", name: ar ? "قارئ نشيط" : "Bookworm" },
            ],
            issuedAt: Date.now(),
            info: {
              templateURL: imageUrl,
              orientation,
              labelLang,
              textColor: textColor || DEFAULT_TEXT_COLOR,
              principalName: ar ? "مدير المدرسة" : "School Principal",
              teacherName: ar ? "معلم المادة" : "Subject Teacher",
              showPrincipalSignature: true,
              showStamp: true,
              showTeacherSignature: true,
            },
          },
          0.9
        );
        if (!cancelled) {
          setPreview(canvas.toDataURL("image/jpeg", 0.85));
          setError("");
        }
      } catch {
        if (!cancelled) {
          setPreview("");
          setError(t("ct.previewFailed", "The template image could not be loaded. Try uploading it again."));
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [imageUrl, orientation, labelLang, textColor, t]);

  async function guide(o: Orientation) {
    setError("");
    try {
      const canvas = await renderGuideCanvas(o);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `lingotrace-certificate-guide-${o}.png`;
      a.click();
    } catch {
      setError(t("ct.guideFailed", "Couldn't create the guide. Please try again."));
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setWarn("");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = /^image\/(png|jpe?g)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
    if (!isPdf && !isImage) {
      setError(t("ct.badType", "Choose a PNG, JPG or PDF file."));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(t("ct.tooBig", "The file is larger than {{mb}} MB.", { mb: MAX_MB }));
      return;
    }
    setBusy(true);
    try {
      const result = await uploadToCloudinary(file, "lingotrace/school-certificate-templates");
      const url = templateImageUrl(result.secure_url, isPdf);
      const img = await loadCorsImage(url);
      const o: Orientation = img.naturalWidth >= img.naturalHeight ? "landscape" : "portrait";
      const ratio = Math.max(img.naturalWidth, img.naturalHeight) / Math.min(img.naturalWidth, img.naturalHeight);
      if (Math.abs(ratio - A4_RATIO) / A4_RATIO > 0.06) {
        setWarn(t("ct.notA4", "This page isn't A4 proportions, so it will look stretched. Export it as A4 ({{o}}).", { o }));
      }
      await onSave({
        imageUrl: url,
        sourceUrl: result.secure_url,
        orientation: o,
        enabled: true,
        labelLang: value?.labelLang ?? "ar",
        textColor: value?.textColor ?? DEFAULT_TEXT_COLOR,
      });
    } catch {
      setError(t("ct.uploadFailed", "Upload failed. Check the file and your connection, then try again."));
    } finally {
      setBusy(false);
    }
  }

  async function update(patch: Partial<CertificateTemplate>) {
    if (!value) return;
    setError("");
    setBusy(true);
    try {
      await onSave({ ...value, ...patch });
    } catch {
      setError(t("ct.saveFailed", "Couldn't save. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    setWarn("");
    try {
      await onSave(null);
    } catch {
      setError(t("ct.saveFailed", "Couldn't save. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="label-eyebrow">{t("ct.title", "Certificate template")}</h2>
        <p className="mt-1 text-xs text-cream-600">
          {t(
            "ct.intro",
            "Use your school's own certificate design. You supply the artwork; LingoTrace prints the student's name, reason, points, rank, badges, signatures, stamp, date and its own logo in fixed positions."
          )}
        </p>
      </div>

      <div className="rounded-lg border border-cream-400/70 bg-cream-100/50 p-3">
        <p className="text-sm font-semibold text-navy">{t("ct.guideTitle", "1. Download the standard guide")}</p>
        <p className="mt-0.5 text-xs text-cream-600">
          {t("ct.guideHint", "Give it to your designer: it shows the A4 page and the boxes that must stay free for LingoTrace's data.")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["landscape", "portrait"] as const).map((o) => (
            <button key={o} type="button" onClick={() => guide(o)} className="btn-secondary inline-flex items-center gap-1.5 py-2 text-sm">
              <Download size={15} />
              {o === "landscape" ? t("ct.landscape", "A4 landscape") : t("ct.portrait", "A4 portrait")}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-cream-400/70 bg-cream-100/50 p-3">
        <p className="text-sm font-semibold text-navy">{t("ct.uploadTitle", "2. Upload your template")}</p>
        <p className="mt-0.5 text-xs text-cream-600">
          {t("ct.uploadHint", "PNG, JPG or PDF (first page), A4, up to {{mb}} MB. Remove the guide layer before exporting.", { mb: MAX_MB })}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={`btn-primary inline-flex cursor-pointer items-center gap-1.5 py-2 text-sm ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <FileUp size={15} />
            {busy ? t("ct.working", "Working…") : value ? t("ct.replace", "Replace template") : t("ct.upload", "Upload template")}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {value && (
            <button type="button" onClick={remove} disabled={busy} className="btn-secondary inline-flex items-center gap-1.5 py-2 text-sm text-red-700">
              <Trash2 size={15} />
              {t("ct.remove", "Remove")}
            </button>
          )}
        </div>
      </div>

      {warn && <p className="text-xs font-semibold text-amber-700">{warn}</p>}
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      {value && (
        <>
          <div className="grid gap-3 border-t border-cream-400/70 pt-3 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 sm:col-span-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{t("ct.enabled", "Offer it to teachers")}</p>
                <p className="text-xs text-cream-600">{t("ct.enabledHint", "When off, teachers only see the platform's own design.")}</p>
              </div>
              <Switch label={t("ct.enabled", "Offer it to teachers")} checked={value.enabled} disabled={busy} onChange={(next) => update({ enabled: next })} />
            </div>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-navy">{t("ct.labelLang", "Language of the labels")}</span>
              <select
                className="input-field w-full"
                value={value.labelLang}
                disabled={busy}
                onChange={(e) => update({ labelLang: e.target.value as "ar" | "en" })}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold text-navy">{t("ct.textColor", "Text colour")}</span>
              <input
                type="color"
                className="h-10 w-full cursor-pointer rounded-lg border border-cream-400 bg-white p-1"
                value={value.textColor || DEFAULT_TEXT_COLOR}
                disabled={busy}
                onChange={(e) => update({ textColor: e.target.value })}
              />
            </label>
          </div>
          {preview ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-cream-600">{t("ct.preview", "Preview with sample data")}</p>
              <img src={preview} alt="" className="w-full rounded-lg border border-cream-400/70" />
            </div>
          ) : (
            !error && <p className="text-xs text-cream-600">{t("ct.previewLoading", "Preparing the preview…")}</p>
          )}
        </>
      )}
    </section>
  );
}
