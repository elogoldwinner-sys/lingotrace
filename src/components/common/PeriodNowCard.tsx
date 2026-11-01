import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Coffee, ArrowRight, Settings2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSchedule } from "../../lib/useSchedule";
import { periodState, slotKey, zonedNow } from "../../lib/schedule";
import { ensurePeriodSession } from "../../lib/services/sessionsService";
import TimetableModal from "./TimetableModal";
import type { ClassRecord } from "../../types";

/**
 * "Where am I in the school day?" — shown above the dashboard calendar. During a period it names the class the teacher
 * has right now (from their timetable and the school's period times, in the school's timezone); clicking it opens that
 * class's attendance sheet for this period, from which one button leads on to the session.
 */
export default function PeriodNowCard({ classes }: { classes: ClassRecord[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { schedule, source, loading } = useSchedule();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editTimes, setEditTimes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // Re-evaluate every 15 seconds so the indicator moves on by itself.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  if (loading) return null;

  const modal = <TimetableModal open={editing} onClose={() => setEditing(false)} classes={classes} startOnTimes={editTimes} />;
  const shell = "mb-4 rounded-2xl border px-4 py-3";

  if (!schedule) {
    return (
      <div className={`${shell} border-dashed border-violet-300 bg-violet-50/50`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
            <CalendarClock size={18} className="shrink-0 text-violet-700" />
            {source === "school"
              ? t("sched.waitPrincipalShort", "Your principal hasn't set the period times yet.")
              : t("sched.setupOwn", "Set your period times to see the current period here.")}
          </p>
          {source === "own" && (
            <button
              type="button"
              onClick={() => {
                setEditTimes(true);
                setEditing(true);
              }}
              className="shrink-0 text-sm font-bold text-violet-700 hover:underline"
            >
              {t("sched.setup", "Set up")}
            </button>
          )}
        </div>
        {modal}
      </div>
    );
  }

  const now = zonedNow(schedule.timezone);
  void tick;
  const state = periodState(schedule, now);
  const timetable = profile?.timetable || {};
  const classOf = (index: number) => classes.find((c) => c.id === timetable[slotKey(now.weekday, index)]);
  const mins = (n: number) => Math.max(1, Math.ceil(n));
  const timeOf = (i: number) => `${schedule.periods[i].start}–${schedule.periods[i].end}`;

  async function openAttendance(classId: string, periodNumber: number) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const sessionId = await ensurePeriodSession(classId, now.date, periodNumber);
      navigate(`/attendance?classId=${encodeURIComponent(classId)}&sessionId=${encodeURIComponent(sessionId)}`);
    } catch (err) {
      console.error("Couldn't open the period's attendance", err);
      setError(true);
      setBusy(false);
    }
  }

  const editButton = (
    <button
      type="button"
      onClick={() => {
        setEditTimes(false);
        setEditing(true);
      }}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-violet-700 hover:underline"
    >
      <Settings2 size={14} />
      {t("sched.myTimetable", "My timetable")}
    </button>
  );

  let body: React.ReactNode;
  let tone = "border-violet-200 bg-violet-50/60";
  if (state.kind === "during") {
    const cls = classOf(state.index);
    const n = state.index + 1;
    if (cls) {
      tone = "border-emerald-300 bg-emerald-50";
      body = (
        <button
          type="button"
          onClick={() => openAttendance(cls.id, n)}
          disabled={busy}
          className="group flex w-full items-center gap-3 text-start disabled:opacity-70"
          aria-label={t("sched.openAttendance", "Open attendance for this period")}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-serif text-lg font-bold text-white">{n}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-navy-800">
              {t("sched.nowPeriod", { defaultValue: "Now: Period {{n}}", n })} · {cls.name}
            </span>
            <span className="block text-xs font-semibold text-emerald-800">
              <span dir="ltr">{timeOf(state.index)}</span> · {t("sched.endsIn", { defaultValue: "ends in {{m}} min", m: mins(state.endsInMin) })}
            </span>
            <span className="block text-xs text-cream-600">{busy ? t("common.loading") : t("sched.tapAttendance", "Tap to take attendance")}</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-emerald-700 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </button>
      );
    } else {
      body = (
        <p className="text-sm font-semibold text-navy-800">
          {t("sched.nowPeriod", { defaultValue: "Now: Period {{n}}", n })} · {t("sched.free", "no class in your timetable")}{" "}
          <span className="text-xs font-normal text-cream-600" dir="ltr">
            {timeOf(state.index)}
          </span>
        </p>
      );
    }
  } else if (state.kind === "break") {
    const next = classOf(state.next);
    body = (
      <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
        <Coffee size={18} className="shrink-0 text-violet-700" />
        {t("sched.breakNext", {
          defaultValue: "Break — Period {{n}}{{cls}} starts in {{m}} min",
          n: state.next + 1,
          cls: next ? ` (${next.name})` : "",
          m: mins(state.startsInMin),
        })}
      </p>
    );
  } else if (state.kind === "before") {
    const next = classOf(0);
    body = (
      <p className="text-sm font-semibold text-navy-800">
        {t("sched.before", { defaultValue: "School starts at {{time}}", time: schedule.periods[0].start })}
        {next ? ` · ${t("sched.firstIs", { defaultValue: "first class: {{name}}", name: next.name })}` : ""}
      </p>
    );
  } else if (state.kind === "after") {
    body = <p className="text-sm font-semibold text-navy-800">{t("sched.after", "The school day is over.")}</p>;
  } else {
    body = <p className="text-sm font-semibold text-navy-800">{t("sched.offDay", "No school today.")}</p>;
  }

  return (
    <div className={`${shell} ${tone}`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-violet-800">
          <CalendarClock size={15} />
          {t("sched.title", "Current period")}
        </span>
        {editButton}
      </div>
      {body}
      {error && <p className="mt-1 text-xs text-red-600">{t("sched.openError", "Couldn't open the attendance. Please try again.")}</p>}
      {modal}
    </div>
  );
}
