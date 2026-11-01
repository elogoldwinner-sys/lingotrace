/**
 * Period times and the teacher timetable.
 *
 * A Schedule is set once per school by the principal (or by an independent teacher for themselves): which weekdays are
 * school days, the timezone, and the start / end time of every period. A teacher then places their classes into the
 * (weekday × period) grid. "Which period is it right now?" is always worked out in the SCHEDULE's timezone, not the
 * device's, so a phone with the wrong timezone still shows the right period.
 */

export interface PeriodTime {
  start: string; // "HH:mm" 24-hour
  end: string; // "HH:mm"
}

export interface Schedule {
  /** IANA timezone, e.g. "Asia/Riyadh". */
  timezone: string;
  /** School days, 0 = Sunday … 6 = Saturday. */
  days: number[];
  periods: PeriodTime[];
}

/** A teacher's timetable: "<weekday>-<period index>" → class id. Weekday 0 = Sunday, period index starts at 0. */
export type Timetable = Record<string, string>;

export const DEFAULT_TIMEZONE = "Asia/Riyadh";
export const MAX_PERIODS = 12;

export const slotKey = (weekday: number, periodIndex: number) => `${weekday}-${periodIndex}`;

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (total: number): string => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Evenly spaced periods: handy as a starting point that the principal then adjusts. */
export function generatePeriods(firstStart: string, lengthMin: number, breakMin: number, count: number): PeriodTime[] {
  const out: PeriodTime[] = [];
  let at = toMinutes(firstStart);
  for (let i = 0; i < count; i++) {
    out.push({ start: fromMinutes(at), end: fromMinutes(at + lengthMin) });
    at += lengthMin + breakMin;
  }
  return out;
}

export function defaultSchedule(timezone = DEFAULT_TIMEZONE): Schedule {
  return { timezone, days: [0, 1, 2, 3, 4], periods: generatePeriods("07:30", 45, 5, 7) };
}

/** A usable timezone name, or the fallback when the stored one isn't recognised. */
export function safeTimezone(tz: string | undefined): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz || DEFAULT_TIMEZONE });
    return tz || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface ZonedNow {
  date: string; // yyyy-MM-dd in that timezone
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since midnight, fractional
}

export function zonedNow(timezone: string, at: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10) + parseInt(get("second"), 10) / 60,
  };
}

export type PeriodState =
  | { kind: "offDay" }
  | { kind: "before"; next: number; startsInMin: number }
  | { kind: "during"; index: number; endsInMin: number }
  | { kind: "break"; next: number; startsInMin: number }
  | { kind: "after" };

/** Where the school day is right now, given the schedule and the current time in the schedule's timezone. */
export function periodState(schedule: Schedule, now: ZonedNow): PeriodState {
  if (!schedule.days.includes(now.weekday) || schedule.periods.length === 0) return { kind: "offDay" };
  const list = schedule.periods;
  for (let i = 0; i < list.length; i++) {
    const start = toMinutes(list[i].start);
    const end = toMinutes(list[i].end);
    if (now.minutes >= start && now.minutes < end) return { kind: "during", index: i, endsInMin: end - now.minutes };
    if (now.minutes < start) {
      return i === 0
        ? { kind: "before", next: 0, startsInMin: start - now.minutes }
        : { kind: "break", next: i, startsInMin: start - now.minutes };
    }
  }
  return { kind: "after" };
}

/** What is wrong with a schedule (a translation key suffix), or null when it is fine. */
export function scheduleProblem(s: Schedule): "noDays" | "noPeriods" | "badTime" | "overlap" | null {
  if (s.days.length === 0) return "noDays";
  if (s.periods.length === 0) return "noPeriods";
  let prevEnd = -1;
  for (const p of s.periods) {
    if (!/^\d{2}:\d{2}$/.test(p.start) || !/^\d{2}:\d{2}$/.test(p.end)) return "badTime";
    const a = toMinutes(p.start);
    const b = toMinutes(p.end);
    if (b <= a) return "badTime";
    if (a < prevEnd) return "overlap";
    prevEnd = b;
  }
  return null;
}

/** Timezones offered in the pickers (the browser's full list when available, otherwise a short list). */
export function timezoneOptions(): string[] {
  const common = [
    "Asia/Riyadh", "Asia/Kuwait", "Asia/Qatar", "Asia/Dubai", "Asia/Bahrain", "Asia/Muscat", "Asia/Baghdad", "Asia/Amman",
    "Asia/Beirut", "Asia/Damascus", "Asia/Aden", "Africa/Cairo", "Africa/Khartoum", "Africa/Tripoli", "Africa/Tunis",
    "Africa/Algiers", "Africa/Casablanca", "Europe/Istanbul", "Europe/London", "Europe/Paris", "America/New_York", "Asia/Karachi",
  ];
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all && all.length) return Array.from(new Set([...common, ...all]));
  } catch {
    /* fall through */
  }
  return common;
}
