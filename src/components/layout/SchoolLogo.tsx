import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { uploadToCloudinary } from "../../lib/cloudinary";

/**
 * The school logo, in a circular frame at the start of the teacher header.
 * Click the circle to upload (or replace) the logo; the small × removes it.
 * Saved on the teacher's own profile, and also used in the header of every
 * printed report. Square images fit the circle best (anything else is
 * centre-cropped by the frame).
 */
export default function SchoolLogo({ size = 48 }: { size?: number }) {
  const { t } = useTranslation();
  const { profile, updateTeacherSchoolLogo } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logo = profile?.schoolLogoURL;

  async function handleSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const result = await uploadToCloudinary(file, "lingotrace/school-logos");
      await updateTeacherSchoolLogo(result.secure_url);
    } catch (err) {
      console.error("Could not upload the school logo", err);
      setError(t("school.uploadError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(t("school.confirmRemove"))) return;
    setBusy(true);
    try {
      await updateTeacherSchoolLogo(null);
    } catch (err) {
      console.error("Could not remove the school logo", err);
      setError(t("school.uploadError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleSelected} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={error || (logo ? t("school.change") : t("school.add"))}
        aria-label={logo ? t("school.change") : t("school.add")}
        className={`group relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white disabled:opacity-70 ${
          logo
            ? "border-2 border-gold/60 shadow-sm"
            : "border-2 border-dashed border-gold/60 text-gold hover:bg-gold-50"
        } ${error ? "!border-red-500" : ""}`}
      >
        {logo ? (
          <img src={logo} alt={t("school.logoAlt")} className="h-full w-full object-cover" />
        ) : (
          <ImagePlus size={Math.round(size * 0.42)} />
        )}
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-full bg-navy/55 text-white transition-opacity ${
            busy ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <ImagePlus size={Math.round(size * 0.36)} />
          )}
        </span>
      </button>
      {logo && !busy && (
        <button
          type="button"
          onClick={handleRemove}
          title={t("school.remove")}
          aria-label={t("school.remove")}
          className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-cream-400 bg-white text-navy shadow hover:bg-red-50 hover:text-red-600"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
