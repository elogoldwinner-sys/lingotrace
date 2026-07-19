import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { SubmissionRecord } from "../../types";
import { awardPoints } from "./pointsService";

const service = createFirestoreService<SubmissionRecord>("submissions");

/**
 * Submissions are keyed deterministically as `${projectId}_${studentId}`
 * rather than an auto-generated id, so a student resubmitting always
 * overwrites their own single record instead of creating duplicates.
 */
function submissionDocId(projectId: string, studentId: string) {
  return `${projectId}_${studentId}`;
}

export function subscribeToSubmissionsForProject(
  projectId: string,
  onData: (submissions: SubmissionRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("projectId", "==", projectId)],
    onData,
    onError
  );
}

/** Live listener for one student's submission to one project — used on the public submit page so grading updates (which lock further edits) reflect immediately. */
export function subscribeToSubmission(
  projectId: string,
  studentId: string,
  onData: (submission: SubmissionRecord | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "submissions", submissionDocId(projectId, studentId)),
    (snapshot) => {
      onData(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as SubmissionRecord) : null);
    },
    (error) => onError?.(error)
  );
}

export async function getSubmissionForStudent(
  projectId: string,
  studentId: string
): Promise<SubmissionRecord | null> {
  const snapshot = await getDoc(doc(db, "submissions", submissionDocId(projectId, studentId)));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as SubmissionRecord;
}

/**
 * Student submits or edits their submission. Always an upsert on the
 * deterministic doc id — the caller (SubmitProjectPage) is responsible for
 * not offering this once the submission has been graded or the deadline
 * has passed.
 */
export async function submitProject(data: {
  projectId: string;
  classId: string;
  studentId: string;
  link: string;
  note?: string;
}) {
  const id = submissionDocId(data.projectId, data.studentId);
  await setDoc(
    doc(db, "submissions", id),
    {
      projectId: data.projectId,
      classId: data.classId,
      studentId: data.studentId,
      link: data.link,
      note: data.note || "",
      submittedAt: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Awards a mark for a submission and credits it to the student's points
 * bank. Runs transactionally through `awardPoints`, but only for the
 * *delta* between this mark and whatever mark was previously awarded for
 * this same submission — so re-grading (e.g. correcting a mark) adjusts the
 * student's total instead of double-counting. Mirrors how re-marking
 * attendance status already avoids double-counting via `pointsAwarded`.
 */
export async function gradeSubmission(data: {
  submissionId: string;
  studentId: string;
  classId: string;
  mark: number;
  awardedBy: string;
}) {
  const subRef = doc(db, "submissions", data.submissionId);
  const snapshot = await getDoc(subRef);
  const previousMark = snapshot.exists() ? ((snapshot.data().awardedMark as number) || 0) : 0;
  const delta = data.mark - previousMark;

  await setDoc(subRef, { awardedMark: data.mark, gradedAt: Date.now() }, { merge: true });

  if (delta !== 0) {
    await awardPoints({
      studentId: data.studentId,
      classId: data.classId,
      amount: delta,
      reason: "project",
      awardedBy: data.awardedBy,
    });
  }
}
