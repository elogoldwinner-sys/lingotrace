import { collection, getDocs, query, where } from "firebase/firestore";
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
  // Single equality filter only (no orderBy) — this needs no composite
  // index, so it always updates live. Sorted newest-first on the client
  // instead of on the server.
  return service.subscribe(
    [service.where("studentId", "==", studentId)],
    (records) => {
      const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));
      onData(sorted);
    },
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
