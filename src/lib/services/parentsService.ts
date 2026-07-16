import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { ParentProfile } from "../../types";

/**
 * Parent portal accounts, one per Firebase Auth uid (doc id = uid), created
 * when a parent completes the /join/:token flow for a class's parent invite
 * link. Each parent account links to exactly one child (studentId) in one
 * class — a parent with multiple children in the school signs up separately
 * per child via that child's class invite link.
 */
export async function getParentProfile(uid: string): Promise<ParentProfile | null> {
  const snapshot = await getDoc(doc(db, "parents", uid));
  if (!snapshot.exists()) return null;
  return snapshot.data() as ParentProfile;
}

export async function createParentProfile(data: {
  uid: string;
  email: string;
  displayName: string;
  classId: string;
  studentId: string;
}) {
  const profile: ParentProfile = {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName,
    role: "parent",
    classId: data.classId,
    studentId: data.studentId,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, "parents", data.uid), profile);
  return profile;
}
