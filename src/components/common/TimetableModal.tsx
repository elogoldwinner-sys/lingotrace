import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";
import ScheduleEditor from "./ScheduleEditor";
import { useAuth } from "../../contexts/AuthContext";
import { useSchedule } from "../../lib/useSchedule";
import { deviceTimezone, slotKey } from "../../lib/schedule";
import type { ClassRecord } from "../../types";

/**
 * The teacher's weekly timetable: for each school day and period, which class they teach. Teachers outside a school
 * also set their own period times in the second tab; in a school the times come from the principal.
 */
export default function TimetableModal({
  open,
  onClose,
  classes,
  startOnTimes = false,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassRecord[];
  startOnTimes?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { profile, updateTeacherTimetable, updateTeacherOwnSchedule } = useAuth();
  const { schedule, source } = useSchedule();
  const [tab, setTab] = useState<"table" | "times">("table");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft({ ...(profile?.timetable || {}) });
    setMessage("");
    setTab(startOnTimes || (!schedule && source === "own") ? "times" : "table");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language === "ar" ? "ar" : "en", { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [i18n.language]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      // Keep only classes that still exist.
      const ids = new Set(classes.map((c) => c.id));
      const clean = Object.fromEntries(Object.entries(draft).filter(([, id]) => !!id && ids.has(id as string)));
      await updateTeacherTimetable(clean);
      setMessage(t("sched.timetableSaved", "Timetable saved."));
    } catch (err) {
      console.error("Saving the timetable failed", err);
      setMessage(t("sched.saveError", "Couldn't save the schedule. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (id: "table" | "times", label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${tab === id ? "bg-navy text-white shadow" : "bg-cream-300/50 text-navy hover:bg-cream-300"}`}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("sched.myTimetable", "My timetable")} widthClassName="max-w-4xl">
      <div className="space-y-4">
        {source === "own" && (
          <div className="flex flex-wrap gap-2">
            {tabBtn("table", t("sched.tabTable", "Timetable"))}
            {tabBtn("times", t("sched.tabTimes", "Period times"))}
          </div>
        )}

        {tab === "times" && source === "own" ? (
          <ScheduleEditor
            value={schedule}
            defaultTimezone={deviceTimezone()}
            onSave={async (s) => {
              await updateTeacherOwnSchedule(s);
              setTab("table");
            }}
          />
        ) : !schedule ? (
          <p className="rounded-lg border border-dashed border-cream-400 px-3 py-6 text-center text-sm text-cream-600">
            {t("sched.waitPrincipal", "Your principal hasn't set the school's period times yet. Once they do, you can fill in your timetable here.")}
          </p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-cream-600">{t("sched.noClasses", "Create a class first, then place it in your timetable.")}</p>
        ) : (
          <>
            <p className="text-sm text-cream-600">
              {t("sched.tableHint", "Pick the class you teach in each period. Leave a slot empty when you're free.")}
            </p>
            <div className="overflow-auto rounded-xl border border-cream-400">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-cream-100">
                  <tr>
                    <th className="min-w-[7.5rem] px-3 py-2 text-start font-bold text-navy">{t("sched.period", "Period")}</th>
                    {schedule.days.map((d) => (
                      <th key={d} className="min-w-[8rem] px-2 py-2 text-start font-bold text-navy">
                        {weekdayNames[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule.periods.map((p, i) => (
                    <tr key={i} className="border-t border-cream-300">
                      <td className="px-3 py-1.5">
                        <p className="font-bold text-navy">{t("sched.periodN", { defaultValue: "Period {{n}}", n: i + 1 })}</p>
                        <p className="text-xs text-cream-600" dir="ltr">
                          {p.start}–{p.end}
                        </p>
                      </td>
                      {schedule.days.map((d) => {
                        const key = slotKey(d, i);
                        return (
                          <td key={d} className="px-2 py-1">
                            <select
                              value={draft[key] || ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setDraft((prev) => {
                                  const next = { ...prev };
                                  if (v) next[key] = v;
                                  else delete next[key];
                                  return next;
                                });
                              }}
                              className="input-field w-full px-2 py-1"
                            >
                              <option value="">—</option>
                              {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {message && <p className="text-sm font-semibold text-navy">{message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                {t("common.close", "Close")}
              </button>
              <button type="button" onClick={save} disabled={busy} className="btn-primary disabled:opacity-60">
                {busy ? t("common.loading") : t("sched.saveTimetable", "Save timetable")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
