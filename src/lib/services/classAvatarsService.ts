import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { avatarKey } from "../avatars";

/**
 * `classAvatars/{classId}` = { taken: { [studentId]: "boys-05.webp" } }
 *
 * The student portal's avatar picker greys out pictures classmates already
 * have. It used to list the whole `students` collection to find out, which
 * handed every student account their classmates' parent contact details. This
 * small doc carries only what the picker needs (which gallery pictures are in
 * use) so students can no longer list `students` at all.
 */

const lastSignature = new Map<string, string>();

/** Teacher side: rebuild the map from the live roster (skips the write when nothing changed). */
export async function syncClassAvatars(
  classId: string,
  students: { id: string; photoURL?: string }[]
): Promise<void> {
  const taken: Record<string, string> = {};
  for (const s of students) {
    const key = avatarKey(s.photoURL);
    if (key) taken[s.id] = key;
  }
  const signature = JSON.stringify(Object.entries(taken).sort(([a], [b]) => a.localeCompare(b)));
  if (lastSignature.get(classId) === signature) return;
  await setDoc(doc(db, "classAvatars", classId), { taken });
  lastSignature.set(classId, signature);
}

/** Student side: the gallery pictures classmates already use (own picture excluded). */
export async function getTakenAvatarUrls(classId: string, myStudentId: string): Promise<{ photoURL: string }[]> {
  const snap = await getDoc(doc(db, "classAvatars", classId));
  const taken = (snap.data()?.taken ?? {}) as Record<string, string>;
  return Object.entries(taken)
    .filter(([studentId]) => studentId !== myStudentId)
    .map(([, key]) => ({ photoURL: `avatars/${key}` }));
}

/** Student side: set my picture and record it in the class's taken map in one atomic write. */
export async function pickAvatar(studentId: string, classId: string, photoURL: string): Promise<void> {
  const key = avatarKey(photoURL);
  const batch = writeBatch(db);
  batch.update(doc(db, "students", studentId), { photoURL, avatarPicked: true });
  if (key) batch.set(doc(db, "classAvatars", classId), { taken: { [studentId]: key } }, { merge: true });
  await batch.commit();
}
