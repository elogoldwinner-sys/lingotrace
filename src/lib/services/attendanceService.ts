import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { AttendanceRecord, AttendanceStatus } from "../../types";

const service = createFirestoreService<AttendanceRecord>("attendance");

/**
 * Real-time feed of every attendance record for a class (no date filter, no
 * orderBy — a single equality clause needs no composite index). Used by the
 * Attendance report page, which then slices by date range on the client.
 */
export function subscribeToAttendanceByClass(
  classId: string,
  onData: (records: AttendanceRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe([service.where("classId", "==", classId)], onData, onError);
}

/** One-off (non-realtime) fetch of a student's attendance within a date range, for report emails. */
export async function getAttendanceForStudentInRange(
  studentId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> {
  const snapshot = await getDocs(
    query(collection(db, "attendance"), where("studentId", "==", studentId))
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord))
    .filter((r) => r.date >= startDate && r.date <= endDate);
}

export function subscribeToAttendanceByDate(
  classId: string,
  date: string,
  onData: (records: AttendanceRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("classId", "==", classId), service.where("date", "==", date)],
    onData,
    onError
  );
}

export function subscribeToStudentAttendance(
  studentId: string,
  onData: (records: AttendanceRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("studentId", "==", studentId), service.orderBy("date", "desc")],
    onData,
    onError
  );
}

/**
 * Attendance taken from inside a specific session (as opposed to the
 * standalone by-date Attendance page). A day can have more than one session,
 * so this is scoped by sessionId rather than just date.
 */
export function subscribeToAttendanceBySession(
  sessionId: string,
  onData: (records: AttendanceRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("sessionId", "==", sessionId)],
    onData,
    onError
  );
}

export async function recordAttendance(data: {
  classId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  note?: string;
  sessionId?: string;
  pointsAwarded?: number;
}) {
  return service.create({ ...data, recordedAt: Date.now() } as Omit<
    AttendanceRecord,
    "id"
  >);
}

export async function updateAttendance(
  id: string,
  data: Partial<AttendanceRecord>
) {
  return service.update(id, data);
}

/**
 * Marks a student's attendance status AND awards/adjusts their points in a
 * single Firestore transaction. Previously these were two separate awaited
 * calls (record attendance, then a second round-trip to award points), so
 * the status pill turned green instantly but the score sat stale for a
 * second or more until the second write landed. Bundling both writes into
 * one transaction means they commit together, so the listeners driving the
 * roster and the score fire at the same time — the score updates the
 * instant the button is pressed.
 */
export async function setAttendanceStatusWithPoints(params: {
  attendanceId?: string; // existing record id, if this student already has one for this session
  classId: string;
  studentId: string;
  date: string;
  sessionId: string;
  status: AttendanceStatus;
  newPoints: number; // points that should be attributed to this status
  previousPoints: number; // points previously attributed (0 if no prior record)
  awardedBy: string;
}) {
  const studentRef = doc(db, "students", params.studentId);
  const attendanceRef = params.attendanceId
    ? doc(db, "attendance", params.attendanceId)
    : doc(collection(db, "attendance"));
  const delta = params.newPoints - params.previousPoints;
  const pointsTxnRef = delta !== 0 ? doc(collection(db, "pointsTransactions")) : null;

  await runTransaction(db, async (tx) => {
    let currentPoints = 0;
    if (pointsTxnRef) {
      const studentSnap = await tx.get(studentRef);
      if (!studentSnap.exists()) {
        throw new Error("Student not found.");
      }
      currentPoints = (studentSnap.data().points as number) || 0;
    }

    tx.set(
      attendanceRef,
      {
        classId: params.classId,
        studentId: params.studentId,
        date: params.date,
        sessionId: params.sessionId,
        status: params.status,
        pointsAwarded: params.newPoints,
        recordedAt: Date.now(),
      },
      { merge: true }
    );

    if (pointsTxnRef) {
      tx.update(studentRef, { points: currentPoints + delta });
      tx.set(pointsTxnRef, {
        studentId: params.studentId,
        classId: params.classId,
        amount: delta,
        reason: "attendance",
        note: "",
        awardedBy: params.awardedBy,
        createdAt: serverTimestamp(),
      });
    }
  });

  return attendanceRef.id;
}
