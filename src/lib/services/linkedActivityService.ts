import { collection, deleteDoc, doc, documentId, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import { awardPoints } from "./pointsService";
import { toMillis } from "../timestamps";
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

/**
 * Newest first. A link that was only just added has no server timestamp yet
 * (reads back as pending), so it counts as "now" and sits at the very top.
 */
function newestFirst(items: LinkedAssignment[]): LinkedAssignment[] {
  const key = (a: LinkedAssignment) => {
    const ms = toMillis(a.createdAt);
    return ms === 0 ? Number.MAX_SAFE_INTEGER : ms;
  };
  return [...items].sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id));
}

/** Every consumer (teacher page, parent portal, student portal) gets the class's links newest-first. */
export function subscribeToClassAssignments(
  classId: string,
  onData: (assignments: LinkedAssignment[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe([service.where("classId", "==", classId)], (items) => onData(newestFirst(items)), onError);
}

/** Live-subscribes to whether a specific (assignment, student) pair has a result yet. */
export function subscribeToLinkedResult(
  assignmentId: string,
  studentId: string,
  onData: (result: LinkedResult | null) => void
) {
  const ref = doc(db, "linkedResults", buildLinkedRef(assignmentId, studentId));
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as LinkedResult) : null);
    },
    () => onData(null)
  );
}

/** Which exam/game results exist, and which marks were already added, for a whole class at once. */
export interface ClassAnswerStatus {
  /** Result-doc ids (`${assignmentId}_${studentId}`) that exist — the student has answered. */
  answered: Set<string>;
  /** Ids of results whose mark the teacher already turned into points. */
  awarded: Set<string>;
  /** False when the awards couldn't be read, so "marks still to add" can't be told apart from "answered". */
  awardsOk: boolean;
}

/**
 * One shared live feed for the teacher's list, so every exam/game can show "students have answered" without being
 * opened: the answers are looked up by id in batches of 30 (one listener per batch, not one per student), and the
 * marks already added come from a single query on the class.
 */
export function subscribeToClassAnswerStatus(
  classId: string,
  refs: string[],
  onData: (status: ClassAnswerStatus) => void
) {
  const chunks: string[][] = [];
  for (let i = 0; i < refs.length; i += 30) chunks.push(refs.slice(i, i + 30));
  const answeredByChunk = new Map<number, Set<string>>();
  let awarded: Set<string> | null = null;
  let awardsOk = true;

  const emit = () => {
    if (awarded === null || answeredByChunk.size < chunks.length) return;
    const answered = new Set<string>();
    answeredByChunk.forEach((ids) => ids.forEach((id) => answered.add(id)));
    onData({ answered, awarded, awardsOk });
  };

  const unsubs = chunks.map((ids, i) =>
    onSnapshot(
      query(collection(db, "linkedResults"), where(documentId(), "in", ids)),
      (snap) => {
        answeredByChunk.set(i, new Set(snap.docs.map((d) => d.id)));
        emit();
      },
      () => {
        answeredByChunk.set(i, new Set());
        emit();
      }
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(db, "linkedMarkAwards"), where("classId", "==", classId)),
      (snap) => {
        awarded = new Set(snap.docs.map((d) => d.id));
        awardsOk = true;
        emit();
      },
      () => {
        awarded = new Set();
        awardsOk = false;
        emit();
      }
    )
  );
  return () => unsubs.forEach((u) => u());
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

export interface BulkMarksResult {
  /** Marks turned into points. */
  added: number;
  /** Marks that failed and can be retried. */
  failed: number;
  /** Total points given. */
  points: number;
}

/**
 * "Add all": turns every answered-but-not-yet-added exam/game score of the given students into points, in one go.
 * Each mark still goes through `addMarkForResult` (claim first, then award), so nothing can be added twice even if
 * this runs on two devices at once. Different students are processed in parallel (a few at a time); one student's
 * marks run one after another because they all update that student's running total.
 */
export async function addAllMarks(data: {
  classId: string;
  assignments: LinkedAssignment[];
  studentIds: string[];
  awardedBy: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<BulkMarksResult> {
  const pairs = data.assignments.flatMap((assignment) =>
    data.studentIds.map((studentId) => ({ assignment, studentId, ref: buildLinkedRef(assignment.id, studentId) }))
  );

  // 1) the scores that exist (looked up by id, 30 at a time)
  const results = new Map<string, LinkedResult>();
  for (let i = 0; i < pairs.length; i += 30) {
    const ids = pairs.slice(i, i + 30).map((p) => p.ref);
    const snap = await getDocs(query(collection(db, "linkedResults"), where(documentId(), "in", ids)));
    snap.docs.forEach((d) => results.set(d.id, { id: d.id, ...d.data() } as LinkedResult));
  }

  // 2) skip what was already added (the claim inside addMarkForResult is the real guard)
  const awarded = new Set<string>();
  try {
    const snap = await getDocs(query(collection(db, "linkedMarkAwards"), where("classId", "==", data.classId)));
    snap.docs.forEach((d) => awarded.add(d.id));
  } catch {
    /* fall back to the per-mark claim */
  }

  const todo = pairs.filter((p) => results.has(p.ref) && !awarded.has(p.ref));
  const byStudent = new Map<string, typeof todo>();
  todo.forEach((p) => byStudent.set(p.studentId, [...(byStudent.get(p.studentId) || []), p]));

  const out: BulkMarksResult = { added: 0, failed: 0, points: 0 };
  let done = 0;
  data.onProgress?.(0, todo.length);

  const queue = [...byStudent.values()];
  async function worker() {
    for (let group = queue.shift(); group; group = queue.shift()) {
      for (const p of group) {
        try {
          const points = await addMarkForResult({
            assignment: p.assignment,
            studentId: p.studentId,
            score: results.get(p.ref)!.score,
            title: p.assignment.title,
            awardedBy: data.awardedBy,
          });
          out.added += 1;
          out.points += points;
        } catch (err) {
          if (!(err instanceof Error && err.message === "already-added")) out.failed += 1;
        }
        done += 1;
        data.onProgress?.(done, todo.length);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return out;
}
