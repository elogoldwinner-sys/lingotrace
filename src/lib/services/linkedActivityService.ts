import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { LinkedAssignment, LinkedResult } from "../../types";

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
