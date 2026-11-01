import { doc, runTransaction, collection, serverTimestamp, getDocs, query, where, writeBatch, increment } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { PointsTransaction, PointsReason } from "../../types";
import { BADGE_CATALOG, evaluateBadgesForStudent } from "./badgesService";
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

export interface SheetMark {
  /** Signed: positive = gained, negative = deducted. */
  amount: number;
  reason: PointsReason;
  note?: string;
  /** Marks from the mark sheet are assessments (quiz, exam…): reports list them apart from the detailed points. */
  assessment?: { kind: string; label?: string; name: string };
}

export interface SheetEntry {
  studentId: string;
  marks: SheetMark[];
  /** The student's points / badges as the teacher's screen has them — used to decide whether a badge may be due. */
  currentPoints: number;
  badgeIds: string[];
}

/**
 * Saves a whole mark sheet (many students × several reasons) in a few batched writes: one log entry per mark plus ONE
 * running-total update per student (using increment, so no reads are needed and totals stay correct even if another
 * mark lands at the same moment). Much cheaper than one transaction per mark. Badges are only re-checked for students
 * whose new total crosses a badge threshold. Resolves with the ids of the students that were saved; students in a
 * failed batch are left out so the caller can keep their cells.
 */
export async function awardSheet(
  classId: string,
  awardedBy: string,
  entries: SheetEntry[]
): Promise<{ saved: string[]; failed: string[] }> {
  const MAX_OPS = 400; // Firestore allows 500 per batch
  const saved: string[] = [];
  const failed: string[] = [];

  let batch = writeBatch(db);
  let ops = 0;
  let inBatch: SheetEntry[] = [];

  const commit = async () => {
    if (inBatch.length === 0) return;
    const group = inBatch;
    try {
      await batch.commit();
      group.forEach((e) => saved.push(e.studentId));
    } catch (err) {
      console.error("Mark sheet batch failed", err);
      group.forEach((e) => failed.push(e.studentId));
    }
    batch = writeBatch(db);
    ops = 0;
    inBatch = [];
  };

  for (const entry of entries) {
    const need = 1 + entry.marks.length;
    if (ops + need > MAX_OPS) await commit();
    const total = entry.marks.reduce((sum, m) => sum + m.amount, 0);
    batch.update(doc(db, "students", entry.studentId), { points: increment(total) });
    for (const m of entry.marks) {
      batch.set(doc(collection(db, "pointsTransactions")), {
        studentId: entry.studentId,
        classId,
        amount: m.amount,
        reason: m.reason,
        note: m.note || "",
        awardedBy,
        ...(m.assessment
          ? {
              assessmentKind: m.assessment.kind,
              ...(m.assessment.label ? { assessmentLabel: m.assessment.label } : {}),
              assessmentName: m.assessment.name,
            }
          : {}),
        createdAt: serverTimestamp(),
      });
    }
    ops += need;
    inBatch.push(entry);
  }
  await commit();

  if (saved.length > 0) markRankingStale(classId);

  // Badge check only where a threshold was actually crossed (avoids a read per student).
  const byId = new Map(entries.map((e) => [e.studentId, e]));
  await Promise.allSettled(
    saved.map(async (id) => {
      const e = byId.get(id)!;
      const newTotal = e.currentPoints + e.marks.reduce((sum, m) => sum + m.amount, 0);
      const due = BADGE_CATALOG.some(
        (b) => b.criteria.type === "points_threshold" && b.criteria.value !== undefined && newTotal >= b.criteria.value && !e.badgeIds.includes(b.id)
      );
      if (due) await evaluateBadgesForStudent(id, newTotal);
    })
  );

  return { saved, failed };
}
