import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { reasonsForAmount, POINTS_REASON_ICONS } from "../../lib/pointsReasons";
import type { PointsReason } from "../../types";

const MAX_CUSTOM_LENGTH = 60;

/** Saves a teacher's own reason (once) to their personal list for the given direction. */
export function useSaveCustomReason() {
  const { profile, updateTeacherCustomReasons } = useAuth();
  return async function saveCustomReason(positive: boolean, text: string) {
    const clean = text.trim();
    if (!clean) return;
    const current = profile?.customReasons ?? { positive: [], negative: [] };
    const key = positive ? "positive" : "negative";
    if (current[key].some((r) => r.toLowerCase() === clean.toLowerCase())) return;
    try {
      await updateTeacherCustomReasons({ ...current, [key]: [...current[key], clean] });
    } catch (err) {
      console.error("Could not save the custom reason", err);
    }
  };
}

/**
 * Reason chooser for giving / deducting marks: the built-in reasons, the teacher's own saved
 * reasons (tap to use, × to delete), and "Add my own" — type a reason and optionally keep it
 * for next time. Custom reasons are stored on the transaction as reason "custom" + the text.
 */
export default function ReasonPicker({
  amount,
  reason,
  note,
  onChange,
  remember,
  onRememberChange,
}: {
  amount: number;
  reason: PointsReason;
  note: string;
  onChange: (reason: PointsReason, note: string) => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { profile, updateTeacherCustomReasons } = useAuth();
  const [typing, setTyping] = useState(false);
  const positive = amount >= 0;
  const saved = (positive ? profile?.customReasons?.positive : profile?.customReasons?.negative) ?? [];
  const builtIn = reasonsForAmount(amount).filter((r) => r !== "custom");
  const chip = (active: boolean) =>
    `flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
      active ? "border-gold bg-gold-50 text-gold" : "border-cream-300 text-cream-600 hover:border-gold/50 hover:text-gold"
    }`;

  async function removeSaved(text: string) {
    const current = profile?.customReasons ?? { positive: [], negative: [] };
    const key = positive ? "positive" : "negative";
    await updateTeacherCustomReasons({ ...current, [key]: current[key].filter((r) => r !== text) });
    if (reason === "custom" && note === text) onChange(builtIn[0], "");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {builtIn.map((r) => {
          const Icon = POINTS_REASON_ICONS[r];
          return (
            <button
              key={r}
              type="button"
              onClick={() => {
                setTyping(false);
                onChange(r, "");
              }}
              className={chip(reason === r)}
            >
              {Icon && <Icon size={14} />}
              {t(`points.reasons.${r}`)}
            </button>
          );
        })}
        {saved.map((text) => {
          const active = reason === "custom" && note === text && !typing;
          return (
            <span key={text} className={`${chip(active)} !py-0 !pe-1 ps-3`}>
              <button
                type="button"
                className="py-1.5"
                onClick={() => {
                  setTyping(false);
                  onChange("custom", text);
                }}
              >
                {text}
              </button>
              <button
                type="button"
                title={t("points.removeSavedReason")}
                onClick={() => removeSaved(text)}
                className="rounded-full p-1 opacity-60 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setTyping(true);
            onChange("custom", "");
          }}
          className={chip(typing)}
        >
          <Plus size={14} />
          {t("points.addOwnReason")}
        </button>
      </div>
      {typing && (
        <div className="mt-2 space-y-1.5">
          <input
            type="text"
            autoFocus
            maxLength={MAX_CUSTOM_LENGTH}
            value={note}
            onChange={(e) => onChange("custom", e.target.value)}
            placeholder={t("points.ownReasonPlaceholder")}
            className="input-field"
          />
          <label className="flex items-center gap-2 text-xs text-cream-700">
            <input type="checkbox" checked={remember} onChange={(e) => onRememberChange(e.target.checked)} />
            {t("points.rememberReason")}
          </label>
        </div>
      )}
    </div>
  );
}
