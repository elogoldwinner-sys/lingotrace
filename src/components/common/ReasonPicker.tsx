import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { POINTS_REASON_ICONS } from "../../lib/pointsReasons";
import { cloneScope, effectiveScope, getPrefs, hasClassOverride, visibleBuiltIn } from "../../lib/reasonPrefs";
import type { PointsReason } from "../../types";

const MAX_CUSTOM_LENGTH = 60;

/** Saves a reason typed in "Add my own" to the list in effect for that class (its own list, or All classes). */
export function useSaveCustomReason() {
  const { profile, updateTeacherReasonPrefs } = useAuth();
  return async function saveCustomReason(classId: string, positive: boolean, text: string) {
    const clean = text.trim();
    if (!clean) return;
    const prefs = getPrefs(profile);
    const key = positive ? "positive" : "negative";
    const target = cloneScope(effectiveScope(prefs, classId));
    if (target[key].custom.some((r) => r.toLowerCase() === clean.toLowerCase())) return;
    target[key].custom.push(clean);
    const next = hasClassOverride(prefs, classId)
      ? { ...prefs, byClass: { ...prefs.byClass, [classId]: target } }
      : { ...prefs, all: target };
    try {
      await updateTeacherReasonPrefs(next);
    } catch (err) {
      console.error("Could not save the custom reason", err);
    }
  };
}

/**
 * Reason chooser for giving / deducting marks. It shows only the reasons the teacher chose in
 * Teacher preferences for this class (built-in ones they kept + their own), plus "Add my own"
 * for a one-off reason. Custom reasons are stored on the transaction as reason "custom" + the text.
 */
export default function ReasonPicker({
  amount,
  classId,
  reason,
  note,
  onChange,
  remember,
  onRememberChange,
}: {
  amount: number;
  classId: string;
  reason: PointsReason;
  note: string;
  onChange: (reason: PointsReason, note: string) => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [typing, setTyping] = useState(false);
  const positive = amount >= 0;
  const scope = effectiveScope(getPrefs(profile), classId);
  const saved = (positive ? scope.positive : scope.negative).custom;
  const builtIn = visibleBuiltIn(positive, scope);
  const chip = (active: boolean) =>
    `flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
      active ? "border-gold bg-gold-50 text-gold" : "border-cream-300 text-cream-600 hover:border-gold/50 hover:text-gold"
    }`;

  // If the selected reason isn't on the teacher's list (e.g. it was switched off, or the sign flipped), move to one that is.
  const builtInKey = builtIn.join(",");
  const savedKey = saved.join("\u0001");
  useEffect(() => {
    if (reason !== "custom") {
      if (typing) setTyping(false);
      if (builtIn.includes(reason)) return;
      if (builtIn.length > 0) onChange(builtIn[0], "");
      else if (saved.length > 0) onChange("custom", saved[0]);
      else {
        setTyping(true);
        onChange("custom", "");
      }
    } else if (!typing && !note && builtIn.length > 0) {
      onChange(builtIn[0], "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtInKey, savedKey, reason, positive]);

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
        {saved.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => {
              setTyping(false);
              onChange("custom", text);
            }}
            className={chip(reason === "custom" && note === text && !typing)}
          >
            {text}
          </button>
        ))}
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
