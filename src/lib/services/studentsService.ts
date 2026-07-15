import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { StudentRecord } from "../../types";

const service = createFirestoreService<StudentRecord>("students");

export function subscribeToStudents(
  classId: string,
  onData: (students: StudentRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("classId", "==", classId)],
    onData,
    onError
  );
}

export async function createStudent(data: {
  name: string;
  classId: string;
  parentName?: string;
  parentEmail?: string;
  photoURL?: string;
}) {
  return service.create({
    ...data,
    points: 0,
    badgeIds: [],
  } as Omit<StudentRecord, "id" | "createdAt">);
}

export async function updateStudent(id: string, data: Partial<StudentRecord>) {
  return service.update(id, data);
}

export async function deleteStudent(id: string) {
  return service.remove(id);
}

/** Atomically awards a badge to a student, avoiding duplicate entries. */
export async function awardBadgeToStudent(studentId: string, badgeId: string) {
  await updateDoc(doc(db, "students", studentId), {
    badgeIds: arrayUnion(badgeId),
  });
}
