import { format } from "date-fns";
import type { FixedReason, ReasonDefaults, UserProfile } from "../types";

/** Today's date as YYYY-MM-DD in the teacher's local time (used by the "today" default). */
export function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function getReasonDefaults(profile: UserProfile | null | undefined): ReasonDefaults {
  return profile?.reasonDefaults?.byClass ? profile.reasonDefaults : { byClass: {} };
}

/** True while a default reason is still in effect: until changed, today only, or while its session is the open one. */
export function isFixedReasonActive(fixed: FixedReason | undefined, activeSessionId: string | null, today = localToday()): boolean {
  if (!fixed) return false;
  if (fixed.duration === "until") return true;
  if (fixed.duration === "day") return fixed.date === today;
  return !!activeSessionId && fixed.sessionId === activeSessionId;
}

/** The default reason for giving (positive) or deducting marks in a class, or null if none is in effect right now. */
export function activeFixedReason(
  defaults: ReasonDefaults,
  classId: string,
  positive: boolean,
  activeSessionId: string | null
): FixedReason | null {
  const entry = defaults.byClass[classId]?.[positive ? "positive" : "negative"];
  return isFixedReasonActive(entry, activeSessionId) ? entry! : null;
}

/** Returns a copy with one class's default set (or cleared when `fixed` is null), dropping day defaults from earlier days. */
export function withFixedReason(
  defaults: ReasonDefaults,
  classId: string,
  positive: boolean,
  fixed: FixedReason | null
): ReasonDefaults {
  const today = localToday();
  const key = positive ? "positive" : "negative";
  const byClass: ReasonDefaults["byClass"] = {};
  for (const [id, entry] of Object.entries(defaults.byClass)) {
    const kept: { positive?: FixedReason; negative?: FixedReason } = {};
    if (entry.positive && !(entry.positive.duration === "day" && entry.positive.date !== today)) kept.positive = entry.positive;
    if (entry.negative && !(entry.negative.duration === "day" && entry.negative.date !== today)) kept.negative = entry.negative;
    if (kept.positive || kept.negative) byClass[id] = kept;
  }
  const current = { ...(byClass[classId] || {}) };
  if (fixed) current[key] = fixed;
  else delete current[key];
  if (current.positive || current.negative) byClass[classId] = current;
  else delete byClass[classId];
  return { byClass };
}
