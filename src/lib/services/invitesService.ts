import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
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
 *
 * Class sharing is exclusive to parents — students are added to the roster
 * manually by the teacher instead of self-joining — so `role` only ever
 * accepts "parent" here. (`InviteRecord.role` still allows "student" as a
 * type so any invite links generated before this change keep resolving.)
 */
export async function getOrCreateInvite(
  classId: string,
  className: string,
  role: "parent",
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

/**
 * The join page used to list /students publicly to build its "pick your
 * child" dropdown, which exposed parent names, e-mails and WhatsApp numbers to
 * anyone who knew a classId. It now reads `roster` from the invite document
 * instead — only {id, name} per student, and only reachable with the token.
 *
 * Teacher-side: writes the roster onto every parent invite of the class, but
 * only when the id/name list actually changed (points, badges etc. also fire
 * student snapshots, so the signature check keeps this to ~zero writes).
 */
const lastRosterSignature = new Map<string, string>();

export async function syncInviteRoster(
  classId: string,
  students: { id: string; name: string }[]
): Promise<void> {
  const roster = students
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const signature = JSON.stringify(roster);
  if (lastRosterSignature.get(classId) === signature) return;

  const invites = await getDocs(
    query(invitesRef, where("classId", "==", classId), where("role", "==", "parent"))
  );
  await Promise.all(
    invites.docs
      .filter((d) => JSON.stringify(d.data().roster ?? null) !== signature)
      .map((d) => updateDoc(d.ref, { roster, rosterUpdatedAt: Date.now() }))
  );
  lastRosterSignature.set(classId, signature);
}

/** One-off refresh from the live roster — used right before a teacher copies the invite link. */
export async function refreshInviteRoster(classId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, "students"), where("classId", "==", classId)));
  await syncInviteRoster(
    classId,
    snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || "" }))
  );
}
