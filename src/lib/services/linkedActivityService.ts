import { deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import { awardPoints } from "./pointsService";
import type { LinkedAssignment, LinkedResult, LinkedMarkAward } from "../../types";

const service = createFirestoreService<LinkedAssignment>("linkedAssignments");

/** Builds the per-student ref token embedded in the activity link, and the matching result doc id. */
export function buildLinkedRef(assignmentId: string, studentId: string) {
  return `${assignmentId}_${studentId}`;
}

/** The link a specific student should open to do an assigned activity without any extra login. */
export function buildLinkedActivityUrl(assignment: LinkedAssignment, studentId: string) {
  const ref = buildLinkedRef(assignment.id, studentId);
  const separator = assignment.url.includes("?") ? "&" : "?";
  return `${assignment.url}${separator}ref=${encodeURIComponent(ref)}`;
}

export async function createLinkedAssignment(data: {
  classId: string;
  teacherId: string;
  title: string;
  url: string;
  source: "gatway" | "play";
}) {
  return service.create(data as Omit<LinkedAssignment, "id" | "createdAt">);
}

export async function deleteLinkedAssignment(id: string) {
  return service.remove(id);
}

export function subscribeToClassAssignments(
  classId: string,
  onData: (assignments: LinkedAssignment[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe([service.where("classId", "==", classId)], onData, onError);
}

/** Live-subscribes to whether a specific (assignment, student) pair has a result yet. */
export function subscribeToLinkedResult(
  assignmentId: string,
  studentId: string,
  onData: (result: LinkedResult | null) => void
) {
  const ref = doc(db, "linkedResults", buildLinkedRef(assignmentId, studentId));
  return onSnapshot(ref, (snap) => {
    onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as LinkedResult) : null);
  });
}

/** One-off fetch, used when composing a parent report or similar non-realtime views. */
export async function getLinkedResultOnce(assignmentId: string, studentId: string) {
  const snap = await getDoc(doc(db, "linkedResults", buildLinkedRef(assignmentId, studentId)));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as LinkedResult) : null;
}

/** Points granted for an exam/game score: a score of 80% gives 8 points (score ÷ 10, rounded, kept within 0–10). */
export function marksForScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score / 10)));
}

/** Live-subscribes to whether this (assignment, student) mark has already been added to the student's points. */
export function subscribeToMarkAward(
  assignmentId: string,
  studentId: string,
  onData: (award: LinkedMarkAward | null) => void
) {
  const ref = doc(db, "linkedMarkAwards", buildLinkedRef(assignmentId, studentId));
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as LinkedMarkAward) : null),
    () => onData(null)
  );
}

/**
 * Turns a student's exam/game score into points — exactly once. The
 * `linkedMarkAwards/{assignmentId_studentId}` doc is claimed first inside a
 * transaction (it fails if it already exists, so a double-click or a second
 * device can't add the mark twice); only then are the points awarded through
 * the normal points engine (so totals, badges and the portals update the
 * same way as any other award). If awarding fails, the claim is released so
 * the teacher can try again.
 */
export async function addMarkForResult(data: {
  assignment: LinkedAssignment;
  studentId: string;
  score: number;
  title: string;
  awardedBy: string;
}) {
  const id = buildLinkedRef(data.assignment.id, data.studentId);
  const awardRef = doc(db, "linkedMarkAwards", id);
  const points = marksForScore(data.score);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(awardRef);
    if (existing.exists()) throw new Error("already-added");
    tx.set(awardRef, {
      assignmentId: data.assignment.id,
      studentId: data.studentId,
      classId: data.assignment.classId,
      points,
      score: data.score,
      awardedBy: data.awardedBy,
      createdAt: serverTimestamp(),
    });
  });

  try {
    if (points > 0) {
      await awardPoints({
        studentId: data.studentId,
        classId: data.assignment.classId,
        amount: points,
        reason: "custom",
        note: `${data.title} (${data.score}%)`,
        awardedBy: data.awardedBy,
      });
    }
  } catch (err) {
    await deleteDoc(awardRef).catch(() => {});
    throw err;
  }
  return points;
}
