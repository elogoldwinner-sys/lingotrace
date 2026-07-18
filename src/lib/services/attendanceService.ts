import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
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
 * Marks a student's attendance status AND awards/adjusts their points.
 *
 * IMPORTANT: this intentionally does NOT use a Firestore transaction.
 * `runTransaction` always waits for a server round-trip before it resolves —
 * the SDK can't apply it to the local cache optimistically the way a plain
 * write can. Using a transaction here previously made BOTH the status pill
 * and the score wait on the network, which felt slower than before.
 *
 * Plain writes (setDoc/updateDoc), on the other hand, are echoed to local
 * onSnapshot listeners immediately — before the network round-trip even
 * finishes — which is what made the status pill feel instant in the first
 * place. Using `increment()` for the points field gets the same instant
 * local echo for the score, without needing to read the current value first.
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

  const writes: Promise<unknown>[] = [
    setDoc(
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
    ),
  ];

  if (delta !== 0) {
    writes.push(
      updateDoc(studentRef, { points: increment(delta) }),
      setDoc(doc(collection(db, "pointsTransactions")), {
        studentId: params.studentId,
        classId: params.classId,
        amount: delta,
        reason: "attendance",
        note: "",
        awardedBy: params.awardedBy,
        createdAt: serverTimestamp(),
      })
    );
  }

  // Fired together (not chained), so neither write waits on the other.
  await Promise.all(writes);

  return attendanceRef.id;
}
