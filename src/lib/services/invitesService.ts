import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { InviteRecord } from "../../types";

const invitesRef = collection(db, "invites");

/** Fetches an invite by its token (the `id` in the /join/:token URL). */
export async function getInvite(token: string): Promise<InviteRecord | null> {
  const snapshot = await getDoc(doc(db, "invites", token));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as InviteRecord;
}

/**
 * Returns the existing invite link for a class + role if one was already
 * generated, otherwise creates one. This means clicking "copy invite link"
 * repeatedly always returns the same shareable URL instead of minting a new
 * token (and orphaning the old one) every time.
 */
export async function getOrCreateInvite(
  classId: string,
  className: string,
  role: "student" | "parent",
  createdBy: string
): Promise<InviteRecord> {
  const existing = await getDocs(
    query(
      invitesRef,
      where("classId", "==", classId),
      where("role", "==", role)
    )
  );
  if (!existing.empty) {
    const docSnap = existing.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as InviteRecord;
  }

  const docRef = await addDoc(invitesRef, {
    classId,
    className,
    role,
    createdBy,
    createdAt: Date.now(),
  });
  return { id: docRef.id, classId, className, role, createdBy, createdAt: Date.now() };
}

export function buildInviteUrl(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}join/${token}`;
}
