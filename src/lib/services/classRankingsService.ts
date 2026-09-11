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
import type { ClassRanking, RankingEntry, RankingPosition, PointsTransaction } from "../../types";

/**
 * A teacher-chosen reporting window for the class-champions podium — an
 * explicit start/end date range (ms since epoch, inclusive) rather than a
 * recurring cycle. The podium only counts points *earned* within this
 * window (summed from each student's pointsTransactions log entries that
 * fall in range), not each student's all-time running total.
 */
export interface RankingPeriod {
  start: number;
  end: number;
}

const DEFAULT_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Falls back to "the last 7 days, ending now" for any teacher who hasn't
 * picked their own start/end date range yet via the trophy icon.
 */
export function getDefaultRankingPeriod(): RankingPeriod {
  const end = Date.now();
  return { start: end - DEFAULT_PERIOD_MS, end };
}

function periodId(period: RankingPeriod): string {
  return `${period.start}_${period.end}`;
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
 * Groups a points-descending list of students into up to 3 podium spots,
 * merging students with equal points into the same spot instead of
 * letting a tie push someone out of the top 3 entirely — e.g. two
 * students tied for 2nd both get shown at 2nd place, and nobody appears
 * at 3rd that period.
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
 * Computes the class-champions top-3 for a class over an explicit
 * start/end date range and saves it, but only if the stored ranking is
 * missing or was computed for a different range — a repeat call for a
 * range that's already computed is a cheap no-op read. Ranked by points
 * *earned within the period* (summed from each student's
 * pointsTransactions log entries that fall in range), not by their
 * all-time running total — so picking a new date range always starts the
 * podium fresh from just that window, not from whatever's accumulated
 * since the start of the school year. Only a class's teacher has read
 * access to its points log, so this can only ever run from the teacher's
 * own client (see firestore.rules) — it's triggered from the teacher
 * dashboard/students tab on load, not on a real schedule, since this app
 * has no backend to run one.
 */
export async function computeAndSaveRankingForPeriod(
  classId: string,
  period: RankingPeriod,
  force = false
): Promise<ClassRanking | null> {
  const id = periodId(period);

  if (!force) {
    const existing = await getDoc(rankingRef(classId));
    if (existing.exists() && (existing.data() as ClassRanking).periodId === id) {
      return existing.data() as ClassRanking;
    }
  }

  const [classSnap, studentsSnap, transactionsSnap] = await Promise.all([
    getDoc(doc(db, "classes", classId)),
    getDocs(query(collection(db, "students"), where("classId", "==", classId))),
    getDocs(query(collection(db, "pointsTransactions"), where("classId", "==", classId))),
  ]);
  const className = (classSnap.data()?.name as string) || "";

  const namesByStudent = new Map<string, string>();
  studentsSnap.docs.forEach((d) => namesByStudent.set(d.id, (d.data().name as string) || ""));

  // Sum only the transactions whose createdAt falls inside [period.start, period.end] —
  // filtered client-side (like getPointsForStudentInRange) since createdAt is stored as
  // a Firestore server Timestamp, not a plain number Firestore can range-query directly.
  const totals = new Map<string, number>();
  transactionsSnap.docs.forEach((d) => {
    const txn = d.data() as PointsTransaction;
    const created = toMillis(txn.createdAt);
    if (created < period.start || created > period.end) return;
    totals.set(txn.studentId, (totals.get(txn.studentId) || 0) + (txn.amount || 0));
  });

  const ranked: RankingEntry[] = Array.from(totals.entries())
    .map(([studentId, points]) => ({
      studentId,
      name: namesByStudent.get(studentId) || "",
      points,
    }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const ranking: ClassRanking = {
    classId,
    className,
    periodId: id,
    periodStart: period.start,
    periodEnd: period.end,
    positions: groupIntoPositions(ranked),
    computedAt: Date.now(),
  };

  await setDoc(rankingRef(classId), ranking);
  return ranking;
}

/** Runs computeAndSaveRankingForPeriod for several classes at once (a teacher's whole class list on dashboard load). */
export async function computeAndSaveRankingsForClasses(
  classIds: string[],
  period: RankingPeriod,
  force = false
): Promise<ClassRanking[]> {
  const results = await Promise.all(
    classIds.map((id) => computeAndSaveRankingForPeriod(id, period, force))
  );
  return results.filter((r): r is ClassRanking => r !== null);
}
