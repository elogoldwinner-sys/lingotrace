import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { subscribeToStudents } from "./studentsService";

/**
 * Deletes every doc in `collectionName` matching `studentId`, in batches of
 * 400 (Firestore batched writes cap at 500 — 400 leaves headroom).
 */
async function deleteAllByStudentId(collectionName: string, studentId: string) {
  const snapshot = await getDocs(
    query(collection(db, collectionName), where("studentId", "==", studentId))
  );
  for (let i = 0; i < snapshot.docs.length; i += 400) {
    const batch = writeBatch(db);
    snapshot.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Resets one student back to a clean slate: points back to 0, badges
 * cleared, and every attendance record, note, and points-transaction tied to
 * them removed. The roster entry itself (name, parent contact info) is left
 * untouched — this is a performance reset, not a deletion.
 */
export async function resetStudentData(studentId: string) {
  await Promise.all([
    updateDoc(doc(db, "students", studentId), { points: 0, badgeIds: [] }),
    deleteAllByStudentId("attendance", studentId),
    deleteAllByStudentId("notes", studentId),
    deleteAllByStudentId("pointsTransactions", studentId),
  ]);
}

/** Resets every student currently on a class's roster. */
export async function resetClassData(studentIds: string[]) {
  for (const studentId of studentIds) {
    await resetStudentData(studentId);
  }
}

/** One-off fetch of every student id in a class, used to drive a whole-class reset. */
export async function getStudentIdsForClass(classId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribeToStudents(
      classId,
      (students) => {
        unsubscribe();
        resolve(students.map((s) => s.id));
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}
