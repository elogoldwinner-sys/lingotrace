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

/** Day-of-week + time-of-day the weekly class-champions board reveals/updates, teacher-configurable. */
export interface RankingSchedule {
  /** 0 (Sunday) – 6 (Saturday). */
  day: number;
  /** 24h "HH:MM". */
  time: string;
}

export const DEFAULT_RANKING_SCHEDULE: RankingSchedule = { day: 4, time: "00:00" }; // Thursday, midnight

function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  return {
    hours: Number.isFinite(h) ? Math.min(Math.max(h, 0), 23) : 0,
    minutes: Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0,
  };
}

/**
 * The ranking period is always exactly 7 days, ending at the most recent
 * occurrence of the configured reveal day+time (defaulting to Thursday
 * midnight so existing classes keep working unchanged). `weekId` is that
 * moment's date — a simple string comparison tells the caller "is this
 * still current, or stale and due for recompute" — and it naturally
 * changes the moment the next reveal moment arrives.
 */
export function getCurrentRankingWeek(
  schedule: RankingSchedule = DEFAULT_RANKING_SCHEDULE
): {
  weekId: string;
  periodStart: number;
  periodEnd: number;
} {
  const now = new Date();
  const { hours, minutes } = parseTime(schedule.time);

  const daysSince = (now.getDay() - schedule.day + 7) % 7;
  const revealMoment = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSince);
  revealMoment.setHours(hours, minutes, 0, 0);

  // If today IS the reveal day but the configured time hasn't happened yet,
  // the most recent reveal was actually a week earlier.
  if (revealMoment.getTime() > now.getTime()) {
    revealMoment.setDate(revealMoment.getDate() - 7);
  }

  const periodEnd = revealMoment.getTime();
  const periodStart = periodEnd - 7 * 24 * 60 * 60 * 1000;

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
  schedule: RankingSchedule = DEFAULT_RANKING_SCHEDULE
): Promise<ClassRanking | null> {
  const { weekId, periodStart, periodEnd } = getCurrentRankingWeek(schedule);

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
  classIds: string[],
  schedule: RankingSchedule = DEFAULT_RANKING_SCHEDULE
): Promise<ClassRanking[]> {
  const results = await Promise.all(
    classIds.map((id) => computeAndSaveWeeklyRankingIfNeeded(id, schedule))
  );
  return results.filter((r): r is ClassRanking => r !== null);
}
