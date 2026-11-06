import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import Modal from "../common/Modal";
import { normalizeWhatsappNumber } from "../../lib/whatsapp";

/**
 * Asks the parent for their WhatsApp number (e.g. 00966xxxxxxxxx) so teachers can contact them
 * and send reports from the student's profile. It is always optional: the first time it appears
 * as a pop-up with a "Skip" button, and afterwards the parent can open it again from the header button.
 */
export default function ParentWhatsappModal({
  open,
  current,
  firstTime,
  onSave,
  onClose,
}: {
  open: boolean;
  /** The number already saved for this parent, if any. */
  current?: string;
  /** True for the automatic pop-up (button says "Skip"); false when opened from the header button. */
  firstTime: boolean;
  /** Saves the cleaned number, or removes it when null. Should throw if saving fails. */
  onSave: (number: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(current || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(current || "");
      setError("");
      setSaving(false);
    }
  }, [open, current]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeWhatsappNumber(value);
    if (!normalized) {
      setError(t("portal.waInvalid"));
      return;
    }
    setSaving(true);
    try {
      await onSave(normalized);
      onClose();
    } catch (err) {
      console.error("Could not save the WhatsApp number", err);
      setError(t("portal.waSaveFailed"));
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await onSave(null);
      onClose();
    } catch (err) {
      console.error("Could not remove the WhatsApp number", err);
      setError(t("portal.waSaveFailed"));
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("portal.waTitle")}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
            <MessageCircle size={20} />
          </span>
          <p className="text-sm text-cream-700">{t("portal.waIntro")}</p>
        </div>
        <div>
          <label className="label-eyebrow block mb-1.5">{t("portal.waLabel")}</label>
          <input
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            placeholder="00966xxxxxxxxx"
            className="input-field"
          />
          <p className="mt-1 text-xs text-cream-600">{t("portal.waHint")}</p>
          {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {!firstTime && current && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {t("portal.waRemove")}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
              {firstTime ? t("portal.waSkip") : t("common.cancel")}
            </button>
            <button type="submit" disabled={saving || !value.trim()} className="btn-primary disabled:opacity-50">
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
