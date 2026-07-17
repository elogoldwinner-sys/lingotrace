import { arrayUnion, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, collection } from "firebase/firestore";
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
  authUid?: string;
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

/**
 * Writes a small `studentAccounts/{uid}` mapping doc — gives Firestore
 * security rules a cheap direct lookup ("does this uid own this studentId?")
 * for points/attendance/notes reads, without needing a collection query.
 */
export async function createStudentAccountMapping(uid: string, studentId: string, classId: string) {
  await setDoc(doc(db, "studentAccounts", uid), {
    uid,
    studentId,
    classId,
    createdAt: Date.now(),
  });
}

/** Links a Firebase Auth uid to an *existing* (teacher-created) roster entry — the "I'm on the roster" join branch. */
export async function linkStudentAccount(studentId: string, authUid: string, classId: string) {
  await updateDoc(doc(db, "students", studentId), { authUid });
  await createStudentAccountMapping(authUid, studentId, classId);
}

/** One-off (non-realtime) fetch of a single student — used when composing a parent report. */
export async function getStudentOnce(studentId: string): Promise<StudentRecord | null> {
  const snapshot = await getDoc(doc(db, "students", studentId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as StudentRecord;
}

/** Real-time listener for a single student — used by the parent portal to watch one child. */
export function subscribeToStudent(
  studentId: string,
  onData: (student: StudentRecord | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "students", studentId),
    (snapshot) => {
      onData(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as StudentRecord) : null);
    },
    (error) => onError?.(error)
  );
}

/** Finds the roster entry linked to a given Firebase Auth uid, if any (student portal lookup). */
export async function findStudentByAuthUid(
  authUid: string
): Promise<StudentRecord | null> {
  const snapshot = await getDocs(
    query(collection(db, "students"), where("authUid", "==", authUid))
  );
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as StudentRecord;
}
