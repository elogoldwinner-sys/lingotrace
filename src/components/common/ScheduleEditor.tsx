import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import {
  MAX_PERIODS,
  defaultSchedule,
  fromMinutes,
  generatePeriods,
  scheduleProblem,
  timezoneOptions,
  toMinutes,
  type Schedule,
} from "../../lib/schedule";

/**
 * Edits the school days, timezone and period times. Used by the principal (School settings) and by teachers who are
 * not in a school. The parent decides what "Save" does and where the schedule is stored.
 */
export default function ScheduleEditor({
  value,
  defaultTimezone,
  onSave,
}: {
  value: Schedule | null;
  defaultTimezone: string;
  onSave: (schedule: Schedule) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<Schedule>(() => value || defaultSchedule(defaultTimezone));
  const [first, setFirst] = useState(() => draft.periods[0]?.start || "07:30");
  const [length, setLength] = useState(45);
  const [gap, setGap] = useState(5);
  const [count, setCount] = useState(() => draft.periods.length || 7);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const zones = useMemo(() => timezoneOptions(), []);

  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language === "ar" ? "ar" : "en", { weekday: "long" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i))); // 2024-01-07 is a Sunday
  }, [i18n.language]);

  const problem = scheduleProblem(draft);
  const problemText = problem
    ? {
        noDays: t("sched.noDays", "Choose at least one school day."),
        noPeriods: t("sched.noPeriods", "Add at least one period."),
        badTime: t("sched.badTime", "Every period must end after it starts."),
        overlap: t("sched.overlap", "Periods can't overlap — each must start after the previous one ends."),
      }[problem]
    : "";

  const touch = (next: Schedule) => {
    setDraft(next);
    setDone(false);
  };

  function setPeriod(i: number, key: "start" | "end", v: string) {
    touch({ ...draft, periods: draft.periods.map((p, idx) => (idx === i ? { ...p, [key]: v } : p)) });
  }

  function addPeriod() {
    if (draft.periods.length >= MAX_PERIODS) return;
    const last = draft.periods[draft.periods.length - 1];
    const start = last ? fromMinutes(toMinutes(last.end) + gap) : first;
    touch({ ...draft, periods: [...draft.periods, { start, end: fromMinutes(toMinutes(start) + length) }] });
  }

  async function save() {
    if (problem) return;
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
      setDone(true);
    } catch (err) {
      console.error("Saving the schedule failed", err);
      setError(t("sched.saveError", "Couldn't save the schedule. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"}`;

  return (
    <div className="space-y-4">
      <div>
        <label className="label-eyebrow mb-1 block">{t("sched.timezone", "Timezone")}</label>
        <select value={draft.timezone} onChange={(e) => touch({ ...draft, timezone: e.target.value })} className="input-field w-full sm:w-auto">
          {(zones.includes(draft.timezone) ? zones : [draft.timezone, ...zones]).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-cream-600">{t("sched.timezoneHint", "The current period is worked out in this timezone, whatever the teacher's device says.")}</p>
      </div>

      <div>
        <label className="label-eyebrow mb-1 block">{t("sched.days", "School days")}</label>
        <div className="flex flex-wrap gap-2">
          {weekdayNames.map((name, i) => (
            <button
              key={i}
              type="button"
              className={chip(draft.days.includes(i))}
              onClick={() => touch({ ...draft, days: draft.days.includes(i) ? draft.days.filter((d) => d !== i) : [...draft.days, i].sort() })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-cream-400 bg-cream-100/60 p-3">
        <p className="label-eyebrow mb-2">{t("sched.quick", "Quick setup")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-cream-700">
            {t("sched.firstStart", "First period starts")}
            <input type="time" value={first} onChange={(e) => setFirst(e.target.value)} className="input-field mt-0.5 block w-auto" />
          </label>
          <label className="text-xs font-semibold text-cream-700">
            {t("sched.length", "Period length (min)")}
            <input type="number" min={5} max={180} value={length} onChange={(e) => setLength(Math.max(5, Number(e.target.value) || 0))} className="input-field mt-0.5 block w-24" />
          </label>
          <label className="text-xs font-semibold text-cream-700">
            {t("sched.gap", "Break between (min)")}
            <input type="number" min={0} max={90} value={gap} onChange={(e) => setGap(Math.max(0, Number(e.target.value) || 0))} className="input-field mt-0.5 block w-24" />
          </label>
          <label className="text-xs font-semibold text-cream-700">
            {t("sched.count", "Number of periods")}
            <input type="number" min={1} max={MAX_PERIODS} value={count} onChange={(e) => setCount(Math.min(MAX_PERIODS, Math.max(1, Number(e.target.value) || 1)))} className="input-field mt-0.5 block w-24" />
          </label>
          <button type="button" className="btn-secondary py-2 text-sm" onClick={() => touch({ ...draft, periods: generatePeriods(first, length, gap, count) })}>
            {t("sched.generate", "Fill the periods")}
          </button>
        </div>
        <p className="mt-2 text-xs text-cream-600">{t("sched.quickHint", "Then adjust any period below — a longer break after the 3rd period, for example.")}</p>
      </div>

      <div className="space-y-2">
        <label className="label-eyebrow block">{t("sched.periods", "Periods")}</label>
        {draft.periods.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm font-bold text-navy">{t("sched.periodN", { defaultValue: "Period {{n}}", n: i + 1 })}</span>
            <input type="time" value={p.start} onChange={(e) => setPeriod(i, "start", e.target.value)} className="input-field w-auto" />
            <span className="text-cream-600">→</span>
            <input type="time" value={p.end} onChange={(e) => setPeriod(i, "end", e.target.value)} className="input-field w-auto" />
            <button
              type="button"
              aria-label={t("common.remove", "Remove")}
              onClick={() => touch({ ...draft, periods: draft.periods.filter((_, idx) => idx !== i) })}
              className="text-cream-600 hover:text-red-600"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button type="button" onClick={addPeriod} disabled={draft.periods.length >= MAX_PERIODS} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline disabled:opacity-50">
          <Plus size={14} />
          {t("sched.addPeriod", "Add a period")}
        </button>
      </div>

      {problemText && <p className="text-sm text-red-600">{problemText}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm font-semibold text-green-700">{t("sched.saved", "Schedule saved.")}</p>}
      <button type="button" onClick={save} disabled={busy || !!problem} className="btn-primary disabled:opacity-60">
        {busy ? t("common.loading") : t("sched.save", "Save schedule")}
      </button>
    </div>
  );
}
