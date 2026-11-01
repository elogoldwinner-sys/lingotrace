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

/**
 * The period times that apply to the signed-in teacher: their school's once the principal has approved them; a
 * principal / staff member who also teaches uses their own school's; anyone else sets their own.
 */
export function useSchedule(): ScheduleInfo {
  const { profile } = useAuth();
  const { membership, memberSchool, staff, school, loading } = useSchool();
  const approved = !!membership && membership.status === "approved";
  const staffOfSchool = !approved && !!staff && !!school;
  const inSchool = approved || staffOfSchool;
  const raw = approved ? memberSchool?.schedule : staffOfSchool ? school!.schedule : profile?.ownSchedule;
  const schedule: Schedule | null = raw && raw.periods?.length ? { timezone: safeTimezone(raw.timezone), days: raw.days || [], periods: raw.periods } : null;
  return { schedule, source: inSchool ? "school" : "own", loading: loading || (approved && !memberSchool) };
}
