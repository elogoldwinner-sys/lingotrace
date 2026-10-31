import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, X } from "lucide-react";
import { uploadToCloudinary } from "../../lib/cloudinary";

/** A small "upload an image" box with preview and remove — used for the school logo, signature and stamp. */
export default function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  folder,
  round,
}: {
  label: string;
  hint?: string;
  value?: string;
  onChange: (url: string | undefined) => void | Promise<void>;
  folder: string;
  round?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await uploadToCloudinary(file, folder);
      await onChange(r.secure_url);
    } catch {
      setError(t("school.uploadError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="label-eyebrow mb-1.5 block">{label}</label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-cream-400 bg-white text-cream-600 transition hover:border-gold disabled:opacity-60 ${
            round ? "rounded-full" : "rounded-xl"
          }`}
        >
          {value ? <img src={value} alt="" className={`h-full w-full ${round ? "object-cover" : "object-contain"}`} /> : <ImagePlus size={22} />}
        </button>
        <div className="min-w-0 text-xs text-cream-600">
          {hint && <p>{hint}</p>}
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1 font-semibold text-red-600 hover:underline"
            >
              <X size={12} />
              {t("sp.remove", "Remove")}
            </button>
          )}
          {error && <p className="mt-1 text-red-600">{error}</p>}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={picked} />
    </div>
  );
}
