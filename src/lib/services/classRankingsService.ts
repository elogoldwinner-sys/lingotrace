import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { toMillis } from "../timestamps";
import type { ClassRanking, RankingEntry } from "../../types";

/**
 * The weekly class-champions reveal moment, teacher-configurable as one
 * exact date+time rather than an abstract "day of week" — periods repeat
 * every 7 days from this anchor, forward and backward, so picking any one
 * precise reveal moment fully determines every week's boundary.
 */
export interface RankingSchedule {
  /** ms since epoch of one exact reveal moment; every other reveal is exactly N×7 days from this. */
  anchor: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Jan 4, 2024 was a Thursday — an arbitrary but stable anchor that
// reproduces the feature's original default ("reveals Thursday at
// midnight") for any teacher who hasn't set their own schedule yet. Any
// Thursday-midnight timestamp works equally well here since periods repeat
// every exact 7 days.
export const DEFAULT_RANKING_SCHEDULE: RankingSchedule = {
  anchor: new Date(2024, 0, 4, 0, 0, 0, 0).getTime(),
};

/**
 * Converts an old day-of-week + "HH:MM" schedule (from before this became
 * an exact-date picker) into an equivalent anchor timestamp, so teachers
 * who already configured a schedule under the previous version don't lose
 * it. Only used as a one-time fallback when reading a profile that has the
 * legacy fields but no `rankingAnchor` yet.
 */
export function legacyDayTimeToAnchor(day: number, time: string): number {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const hours = Number.isFinite(h) ? Math.min(Math.max(h, 0), 23) : 0;
  const minutes = Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0;

  const now = new Date();
  const daysSince = (now.getDay() - day + 7) % 7;
  const moment = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSince);
  moment.setHours(hours, minutes, 0, 0);
  if (moment.getTime() > now.getTime()) {
    moment.setDate(moment.getDate() - 7);
  }
  return moment.getTime();
}

/**
 * The ranking period is always exactly 7 days, ending at the most recent
 * occurrence of the configured anchor (defaulting to Thursday midnight so
 * classes work unchanged until a teacher picks their own). `weekId` is
 * that moment's date — a simple string comparison tells the caller "is
 * this still current, or stale and due for recompute" — and it naturally
 * changes the moment the next reveal moment arrives.
 */
export function getCurrentRankingWeek(
  schedule: RankingSchedule = DEFAULT_RANKING_SCHEDULE
): {
  weekId: string;
  periodStart: number;
  periodEnd: number;
} {
  const now = Date.now();
  const weeksSinceAnchor = Math.floor((now - schedule.anchor) / WEEK_MS);
  const periodEnd = schedule.anchor + weeksSinceAnchor * WEEK_MS;
  const periodStart = periodEnd - WEEK_MS;

  const revealMoment = new Date(periodEnd);
  const weekId = `${revealMoment.getFullYear()}-${String(revealMoment.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(revealMoment.getDate()).padStart(2, "0")}`;

  return { weekId, periodStart, periodEnd };
}

function rankingRef(classId: string) {
  return doc(db, "classRankings", classId);
}

/** Live-subscribes to a class's current ranking doc. Calls back with `null` if none has been computed yet. */
export function subscribeToClassRanking(
  classId: string,
  onData: (ranking: ClassRanking | null) => void
) {
  return onSnapshot(rankingRef(classId), (snapshot) => {
    onData(snapshot.exists() ? (snapshot.data() as ClassRanking) : null);
  });
}

/** One-off (non-realtime) fetch, used where a live subscription isn't needed (e.g. the portal's "should I celebrate?" check). */
export async function getClassRankingOnce(classId: string): Promise<ClassRanking | null> {
  const snapshot = await getDoc(rankingRef(classId));
  return snapshot.exists() ? (snapshot.data() as ClassRanking) : null;
}

/**
 * Computes this week's top 3 point-earners for a class and saves it,
 * but only if the stored ranking is missing or for a past week — a repeat
 * call for a week that's already computed is a cheap no-op read. Only a
 * class's teacher has read access to every student's points, so this can
 * only ever run from the teacher's own client (see firestore.rules) — it's
 * triggered from the teacher dashboard on load, not on a real schedule,
 * since this app has no backend to run one.
 */
export async function computeAndSaveWeeklyRankingIfNeeded(
  classId: string,
  schedule: RankingSchedule = DEFAULT_RANKING_SCHEDULE,
  force = false
): Promise<ClassRanking | null> {
  const { weekId, periodStart, periodEnd } = getCurrentRankingWeek(schedule);

  if (!force) {
    const existing = await getDoc(rankingRef(classId));
    if (existing.exists() && (existing.data() as ClassRanking).weekId === weekId) {
      return existing.data() as ClassRanking;
    }
  }

  const [studentsSnap, txnSnap] = await Promise.all([
    getDocs(query(collection(db, "students"), where("classId", "==", classId))),
    getDocs(query(collection(db, "pointsTransactions"), where("classId", "==", classId))),
  ]);

  const earnedByStudent = new Map<string, number>();
  txnSnap.docs.forEach((d) => {
    const txn = d.data();
    const created = toMillis(txn.createdAt);
    if (created >= periodStart && created <= periodEnd) {
      const studentId = txn.studentId as string;
      earnedByStudent.set(studentId, (earnedByStudent.get(studentId) || 0) + (txn.amount as number));
    }
  });

  const ranked: RankingEntry[] = studentsSnap.docs
    .map((d) => ({
      studentId: d.id,
      name: (d.data().name as string) || "",
      points: earnedByStudent.get(d.id) || 0,
    }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, 3);

  const ranking: ClassRanking = {
    classId,
    weekId,
    periodStart,
    periodEnd,
    gold: ranked[0] || null,
    silver: ranked[1] || null,
    bronze: ranked[2] || null,
    computedAt: Date.now(),
  };

  await setDoc(rankingRef(classId), ranking);
  return ranking;
}

/** Runs computeAndSaveWeeklyRankingIfNeeded for several classes at once (a teacher's whole class list on dashboard load). */
export async function computeAndSaveWeeklyRankingsForClasses(
  classIds: string[],
  schedule: RankingSchedule = DEFAULT_RANKING_SCHEDULE,
  force = false
): Promise<ClassRanking[]> {
  const results = await Promise.all(
    classIds.map((id) => computeAndSaveWeeklyRankingIfNeeded(id, schedule, force))
  );
  return results.filter((r): r is ClassRanking => r !== null);
}
