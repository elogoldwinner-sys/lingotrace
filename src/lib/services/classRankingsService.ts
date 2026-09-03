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
import type { ClassRanking, RankingEntry, RankingPosition } from "../../types";

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
 * Live-subscribes to every class's current ranking at once — used for the
 * parent portal's school-wide "students of the week" view, which shows
 * every class's board (not only the classes this parent's own children
 * belong to). `classRankings` is readable by anyone signed in (see
 * firestore.rules), matching the same school-wide posture as the single
 * announcements/current doc.
 */
export function subscribeToAllClassRankings(onData: (rankings: ClassRanking[]) => void) {
  return onSnapshot(collection(db, "classRankings"), (snapshot) => {
    onData(snapshot.docs.map((d) => d.data() as ClassRanking));
  });
}

/**
 * Groups a points-descending list of students into up to 3 podium spots,
 * merging students with equal points into the same spot instead of
 * letting a tie push someone out of the top 3 entirely — e.g. two
 * students tied for 2nd both get shown at 2nd place, and nobody appears
 * at 3rd that week.
 */
function groupIntoPositions(ranked: RankingEntry[]): RankingPosition[] {
  const positions: RankingPosition[] = [];
  let i = 0;
  while (i < ranked.length && positions.length < 3) {
    const points = ranked[i].points;
    const entries: RankingEntry[] = [];
    while (i < ranked.length && ranked[i].points === points) {
      entries.push(ranked[i]);
      i++;
    }
    positions.push({ rank: (positions.length + 1) as 1 | 2 | 3, points, entries });
  }
  return positions;
}

/**
 * Computes this week's top-3 by current total points for a class and
 * saves it, but only if the stored ranking is missing or for a past week
 * — a repeat call for a week that's already computed is a cheap no-op
 * read. Ranked by each student's current `points` total (the same number
 * shown on their card), not by points earned in some rolling window —
 * "renews every week" means the board is re-snapshotted fresh at each
 * scheduled reveal moment and then held steady until the next one, not
 * that only that week's activity counts. Only a class's teacher has read
 * access to every student's record, so this can only ever run from the
 * teacher's own client (see firestore.rules) — it's triggered from the
 * teacher dashboard/students tab on load, not on a real schedule, since
 * this app has no backend to run one.
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

  const [classSnap, studentsSnap] = await Promise.all([
    getDoc(doc(db, "classes", classId)),
    getDocs(query(collection(db, "students"), where("classId", "==", classId))),
  ]);
  const className = (classSnap.data()?.name as string) || "";

  const ranked: RankingEntry[] = studentsSnap.docs
    .map((d) => ({
      studentId: d.id,
      name: (d.data().name as string) || "",
      points: (d.data().points as number) || 0,
      photoURL: (d.data().photoURL as string) || "",
    }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const ranking: ClassRanking = {
    classId,
    className,
    weekId,
    periodStart,
    periodEnd,
    positions: groupIntoPositions(ranked),
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
