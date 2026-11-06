import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Minus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import Modal from "./Modal";
import ReasonPicker, { useSaveCustomReason } from "./ReasonPicker";
import { activeFixedReason, getReasonDefaults, localToday, withFixedReason } from "../../lib/reasonDefaults";
import { reasonsForAmount } from "../../lib/pointsReasons";
import type { FixedReason, FixedReasonDuration, PointsReason } from "../../types";

function reasonLabel(t: (key: string) => string, fixed: FixedReason): string {
  return fixed.reason === "custom" ? fixed.note || t("points.reasons.custom") : t(`points.reasons.${fixed.reason}`);
}

/**
 * "Default reason" strip on the Sessions page: the teacher sets the reason that is pre-selected when giving
 * (and, separately, deducting) marks in this class — for the open session, for today, or until changed. It is only
 * a starting choice: the teacher can still pick another reason for any student in the marks window.
 */
export default function FixedReasonBar({ classId, activeSessionId }: { classId: string; activeSessionId: string | null }) {
  const { t } = useTranslation();
  const { profile, updateTeacherReasonDefaults } = useAuth();
  const saveCustomReason = useSaveCustomReason();
  const defaults = getReasonDefaults(profile);

  const [editing, setEditing] = useState<null | boolean>(null); // true = giving, false = deducting
  const [reason, setReason] = useState<PointsReason>("participation");
  const [note, setNote] = useState("");
  const [remember, setRemember] = useState(false);
  const [duration, setDuration] = useState<FixedReasonDuration>("day");
  const [saving, setSaving] = useState(false);

  function openEditor(positive: boolean) {
    const current = activeFixedReason(defaults, classId, positive, activeSessionId);
    setReason(current ? current.reason : reasonsForAmount(positive ? 1 : -1)[0]);
    setNote(current?.note || "");
    setDuration(current ? current.duration : activeSessionId ? "session" : "day");
    setRemember(false);
    setEditing(positive);
  }

  async function persist(positive: boolean, fixed: FixedReason | null) {
    setSaving(true);
    try {
      await updateTeacherReasonDefaults(withFixedReason(defaults, classId, positive, fixed));
      setEditing(null);
    } catch (err) {
      console.error("Could not save the default reason", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (editing === null) return;
    const cleanNote = note.trim();
    if (reason === "custom" && !cleanNote) return;
    if (duration === "session" && !activeSessionId) return;
    const fixed: FixedReason = {
      reason,
      duration,
      ...(reason === "custom" ? { note: cleanNote } : {}),
      ...(duration === "session" ? { sessionId: activeSessionId! } : {}),
      ...(duration === "day" ? { date: localToday() } : {}),
    };
    if (reason === "custom" && remember) await saveCustomReason(classId, editing, cleanNote);
    await persist(editing, fixed);
  }

  const options: { value: FixedReasonDuration; label: string; disabled?: boolean }[] = [
    { value: "session", label: t("sessions.fixedForSession"), disabled: !activeSessionId },
    { value: "day", label: t("sessions.fixedForDay") },
    { value: "until", label: t("sessions.fixedUntilChanged") },
  ];

  const row = (positive: boolean) => {
    const fixed = activeFixedReason(defaults, classId, positive, activeSessionId);
    const Icon = positive ? Plus : Minus;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            positive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          <Icon size={14} />
        </span>
        <span className="text-xs text-cream-600 shrink-0">{t(positive ? "sessions.fixedGiving" : "sessions.fixedDeducting")}</span>
        <span className="truncate text-sm font-semibold text-navy">
          {fixed ? reasonLabel(t, fixed) : t("sessions.fixedNone")}
        </span>
        {fixed && (
          <span className="shrink-0 rounded-full bg-gold-50 px-2 py-0.5 text-[10px] font-semibold text-gold">
            {fixed.duration === "session"
              ? t("sessions.fixedBadgeSession")
              : fixed.duration === "day"
                ? t("sessions.fixedBadgeDay")
                : t("sessions.fixedBadgeUntil")}
          </span>
        )}
        <button
          type="button"
          onClick={() => openEditor(positive)}
          className="shrink-0 rounded-full p-1 text-cream-600 hover:bg-cream-300 hover:text-navy"
          title={t("sessions.fixedEdit")}
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="card px-4 py-3">
        <p className="label-eyebrow mb-2">{t("sessions.fixedTitle")}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
          {row(true)}
          {row(false)}
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t(editing ? "sessions.fixedModalGiving" : "sessions.fixedModalDeducting")}
      >
        {editing !== null && (
          <div className="space-y-4">
            <p className="text-xs text-cream-600">{t("sessions.fixedHint")}</p>
            <ReasonPicker
              amount={editing ? 1 : -1}
              classId={classId}
              reason={reason}
              note={note}
              onChange={(r, n) => {
                setReason(r);
                setNote(n);
              }}
              remember={remember}
              onRememberChange={setRemember}
              extraCustom={reason === "custom" && note ? note : undefined}
            />
            <div>
              <p className="label-eyebrow mb-1.5">{t("sessions.fixedDuration")}</p>
              <div className="space-y-1.5">
                {options.map((o) => (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2 text-sm ${o.disabled ? "text-cream-500" : "text-navy"}`}
                  >
                    <input
                      type="radio"
                      name="fixed-reason-duration"
                      checked={duration === o.value}
                      disabled={o.disabled}
                      onChange={() => setDuration(o.value)}
                    />
                    {o.label}
                    {o.disabled && <span className="text-xs">({t("sessions.fixedOpenSessionFirst")})</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {activeFixedReason(defaults, classId, editing, activeSessionId) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => persist(editing, null)}
                    className="text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {t("sessions.fixedClear")}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary">
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || (reason === "custom" && !note.trim())}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
