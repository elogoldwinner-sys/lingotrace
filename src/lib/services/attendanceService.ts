import { createFirestoreService } from "../firestoreService";
import type { AttendanceRecord, AttendanceStatus } from "../../types";

const service = createFirestoreService<AttendanceRecord>("attendance");

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

export async function recordAttendance(data: {
  classId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  note?: string;
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
