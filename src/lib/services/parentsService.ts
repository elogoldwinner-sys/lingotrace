import { arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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
