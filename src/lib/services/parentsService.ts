import { arrayRemove, arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { ParentProfile } from "../../types";

/**
 * Parent portal accounts, one per Firebase Auth uid (doc id = uid). A parent
 * with multiple children (in the same class or different classes) joins
 * each child's invite link with the same Google account, and every child
 * accumulates into `studentIds` — see `addChildToParent` below.
 *
 * Older accounts (created before multi-child support) may still have the
 * legacy single `studentId` field instead of `studentIds`; this is
 * normalized into `studentIds` on read so the rest of the app never has to
 * know the difference.
 */
export async function getParentProfile(uid: string): Promise<ParentProfile | null> {
  const snapshot = await getDoc(doc(db, "parents", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Record<string, unknown>;
  const studentIds: string[] = Array.isArray(data.studentIds)
    ? (data.studentIds as string[])
    : typeof data.studentId === "string"
      ? [data.studentId]
      : [];
  return {
    uid: data.uid as string,
    email: (data.email as string) || "",
    displayName: (data.displayName as string) || "",
    role: "parent",
    studentIds,
    createdAt: (data.createdAt as number) || 0,
  };
}

/**
 * Removes one child from a parent's portal account — used when a teacher
 * revokes a specific parent's access to a student (see
 * `StudentsPage.handleRemoveParentAccess`). Only ever removes, never adds:
 * `firestore.rules` allows a teacher to shrink a parent's `studentIds` by
 * exactly one entry, and only when that entry is a student in a class they
 * own — a teacher can't touch any other entry in the same parent's list
 * (e.g. a sibling in a different teacher's class).
 */
export async function removeChildFromParent(parentUid: string, studentId: string) {
  await updateDoc(doc(db, "parents", parentUid), { studentIds: arrayRemove(studentId) });
}

/**
 * Adds a child to a parent's portal account, creating the account on first
 * use. Uses `arrayUnion` so re-joining the same child's invite link (or
 * clicking an old link again) is a safe no-op instead of creating a
 * duplicate entry.
 */
export async function addChildToParent(data: {
  uid: string;
  email: string;
  displayName: string;
  studentId: string;
}) {
  const ref = doc(db, "parents", data.uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    await updateDoc(ref, { studentIds: arrayUnion(data.studentId) });
  } else {
    await setDoc(ref, {
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
      role: "parent",
      studentIds: [data.studentId],
      createdAt: Date.now(),
    });
  }
}
