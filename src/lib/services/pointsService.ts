import { doc, runTransaction, collection, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { PointsTransaction, PointsReason } from "../../types";
import { evaluateBadgesForStudent } from "./badgesService";
import { toMillis } from "../timestamps";
import { markRankingStale } from "./classRankingsService";

const service = createFirestoreService<PointsTransaction>("pointsTransactions");

export function subscribeToStudentPointsHistory(
  studentId: string,
  onData: (transactions: PointsTransaction[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("studentId", "==", studentId), service.orderBy("createdAt", "desc")],
    onData,
    onError
  );
}

/**
 * Awards (or deducts) points for a student. Runs as a Firestore transaction so
 * the student's running total and the transaction log stay consistent even
 * under concurrent writes ("instant updates" from the spec). After the points
 * total changes, badge criteria are re-evaluated so new badges are awarded
 * automatically (the "automatic badge engine").
 */
export async function awardPoints(data: {
  studentId: string;
  classId: string;
  amount: number;
  reason: PointsReason;
  note?: string;
  awardedBy: string;
  /** The session the mark was given in, if any (shown in the Session Summary). */
  sessionId?: string;
}) {
  const studentRef = doc(db, "students", data.studentId);
  const transactionRef = doc(collection(db, "pointsTransactions"));

  let newTotal = 0;

  await runTransaction(db, async (tx) => {
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists()) {
      throw new Error("Student not found.");
    }
    const currentPoints = (studentSnap.data().points as number) || 0;
    newTotal = currentPoints + data.amount;

    tx.update(studentRef, { points: newTotal });
    tx.set(transactionRef, {
      studentId: data.studentId,
      classId: data.classId,
      amount: data.amount,
      reason: data.reason,
      note: data.note || "",
      awardedBy: data.awardedBy,
      ...(data.sessionId ? { sessionId: data.sessionId } : {}),
      createdAt: serverTimestamp(),
    });
  });

  markRankingStale(data.classId);

  // Self-healing re-evaluation: check if the new total unlocks any badges.
  await evaluateBadgesForStudent(data.studentId, newTotal);

  return { newTotal };
}

/** One-off (non-realtime) fetch of a student's points transactions within a date range, for report emails. */
export async function getPointsForStudentInRange(
  studentId: string,
  startMs: number,
  endMs: number
): Promise<PointsTransaction[]> {
  const snapshot = await getDocs(
    query(collection(db, "pointsTransactions"), where("studentId", "==", studentId))
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as PointsTransaction))
    .filter((txn) => {
      const created = toMillis(txn.createdAt);
      return created >= startMs && created <= endMs;
    });
}

/** Gives the same mark to several students at once (e.g. a whole group). Resolves with how many were saved. */
export async function awardPointsToMany(
  studentIds: string[],
  data: Omit<Parameters<typeof awardPoints>[0], "studentId">
): Promise<number> {
  const results = await Promise.allSettled(studentIds.map((studentId) => awardPoints({ ...data, studentId })));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed === results.length && failed > 0) throw new Error("Could not save the marks.");
  return results.length - failed;
}

/** Every mark the teacher gave inside one session (one-off fetch, oldest first). */
export async function getSessionTransactions(sessionId: string, teacherId: string): Promise<PointsTransaction[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "pointsTransactions"),
      where("sessionId", "==", sessionId),
      where("awardedBy", "==", teacherId)
    )
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as PointsTransaction))
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
}
