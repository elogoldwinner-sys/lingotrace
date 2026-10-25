import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../common/Modal";
import StudentAvatar from "./StudentAvatar";
import { avatarKey } from "../../lib/avatars";

/**
 * Gallery of avatars to choose from. Avatars already used by a classmate are
 * greyed out (no duplicates in a class). Choosing is a two-step: tap one, then
 * confirm.
 */
export default function AvatarPickerModal({
  open,
  onClose,
  title,
  pool,
  taken,
  currentUrl,
  onConfirm,
  warning,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  pool: string[];
  /** File names (see avatarKey) already used by classmates. */
  taken: Set<string>;
  currentUrl?: string;
  onConfirm: (url: string) => Promise<void>;
  /** A prominent notice above the buttons (e.g. "you can choose only once"). */
  warning?: string;
  /** Extra controls next to Cancel/Confirm (e.g. the teacher's "upload a photo" button). */
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSelected("");
      setError("");
    }
  }, [open]);

  const free = pool.filter((u) => !taken.has(avatarKey(u) || "")).length;

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      console.error("Could not save the avatar", err);
      setError(t("avatars.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} widthClassName="max-w-2xl">
      <div className="space-y-4">
        <p className="text-xs font-semibold text-cream-600">{t("avatars.available", { free, total: pool.length })}</p>
        <div className="grid max-h-[46vh] grid-cols-4 gap-3 overflow-y-auto p-1 sm:grid-cols-6">
          {pool.map((u) => {
            const isTaken = taken.has(avatarKey(u) || "");
            const isCurrent = !!currentUrl && avatarKey(currentUrl) === avatarKey(u);
            const isSel = selected === u;
            return (
              <button
                key={u}
                type="button"
                disabled={isTaken}
                onClick={() => setSelected(u)}
                title={isTaken ? t("avatars.taken") : undefined}
                className={`relative flex items-center justify-center rounded-full p-1 transition ${
                  isTaken ? "cursor-not-allowed opacity-30 grayscale" : "hover:scale-105"
                } ${isSel ? "bg-gold-50 ring-4 ring-gold" : isCurrent ? "ring-2 ring-navy/40" : ""}`}
              >
                <StudentAvatar photoURL={u} name="" size={72} />
              </button>
            );
          })}
        </div>
        {warning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">⚠️ {warning}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>{extra}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t("common.cancel")}
            </button>
            <button type="button" onClick={confirm} disabled={!selected || busy} className="btn-primary disabled:opacity-50">
              {t("avatars.confirm")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
