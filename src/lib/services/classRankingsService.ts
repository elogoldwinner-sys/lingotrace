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
 * The ranking week runs Friday through Thursday, so a full school week
 * (Sun-Thu locally) is always included by the time it's revealed. `weekId`
 * is the ending Thursday's date — the same value all week, so "is this
 * still current" is a simple string comparison, and it naturally changes
 * the moment the next Thursday arrives.
 */
export function getCurrentRankingWeek(): {
  weekId: string;
  periodStart: number;
  periodEnd: number;
} {
  const now = new Date();
  const day = now.getDay(); // Sun=0 ... Thu=4 ... Sat=6
  const daysSinceThursday = (day - 4 + 7) % 7;

  const thursday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceThursday);
  thursday.setHours(0, 0, 0, 0);

  const periodStartDate = new Date(thursday);
  periodStartDate.setDate(periodStartDate.getDate() - 6); // previous Friday
  periodStartDate.setHours(0, 0, 0, 0);

  const periodEndDate = new Date(thursday);
  periodEndDate.setHours(23, 59, 59, 999);

  const weekId = `${thursday.getFullYear()}-${String(thursday.getMonth() + 1).padStart(2, "0")}-${String(
    thursday.getDate()
  ).padStart(2, "0")}`;

  return { weekId, periodStart: periodStartDate.getTime(), periodEnd: periodEndDate.getTime() };
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
  classId: string
): Promise<ClassRanking | null> {
  const { weekId, periodStart, periodEnd } = getCurrentRankingWeek();

  const existing = await getDoc(rankingRef(classId));
  if (existing.exists() && (existing.data() as ClassRanking).weekId === weekId) {
    return existing.data() as ClassRanking;
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
  classIds: string[]
): Promise<ClassRanking[]> {
  const results = await Promise.all(classIds.map((id) => computeAndSaveWeeklyRankingIfNeeded(id)));
  return results.filter((r): r is ClassRanking => r !== null);
}
