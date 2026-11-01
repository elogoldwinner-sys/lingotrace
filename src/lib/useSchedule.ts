import { useAuth } from "../contexts/AuthContext";
import { useSchool } from "../contexts/SchoolContext";
import { safeTimezone, type Schedule } from "./schedule";

export interface ScheduleInfo {
  schedule: Schedule | null;
  /** "school": set by the principal (read-only for the teacher). "own": the teacher's own, for teachers outside a school. */
  source: "school" | "own";
  /** True while the school / profile is still loading. */
  loading: boolean;
}

/** The period times that apply to the signed-in teacher: their school's once approved, otherwise their own. */
export function useSchedule(): ScheduleInfo {
  const { profile } = useAuth();
  const { membership, memberSchool, loading } = useSchool();
  const approved = !!membership && membership.status === "approved";
  // Approved in a school: wait for that school's live record, then use the principal's schedule.
  const inSchool = approved;
  const raw = inSchool ? memberSchool?.schedule : profile?.ownSchedule;
  const schedule: Schedule | null = raw && raw.periods?.length ? { timezone: safeTimezone(raw.timezone), days: raw.days || [], periods: raw.periods } : null;
  return { schedule, source: inSchool ? "school" : "own", loading: loading || (inSchool && !memberSchool) };
}
