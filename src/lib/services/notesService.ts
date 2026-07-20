import { addDoc, collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { NoteRecord, NoteSentiment } from "../../types";
import { toMillis } from "../timestamps";

const service = createFirestoreService<NoteRecord>("notes");

export function subscribeToStudentNotes(
  studentId: string,
  onData: (notes: NoteRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("studentId", "==", studentId), service.orderBy("createdAt", "desc")],
    onData,
    onError
  );
}

/**
 * Notes a parent is allowed to see for their child. Filtered server-side
 * (two equality clauses only, no orderBy — avoids needing a composite index)
 * so the Firestore rules can enforce visibility per-document; sorted
 * newest-first on the client instead.
 */
export function subscribeToVisibleParentNotes(
  studentId: string,
  onData: (notes: NoteRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [
      service.where("studentId", "==", studentId),
      service.where("visibleToParent", "==", true),
    ],
    (notes) => {
      const sorted = [...notes].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onData(sorted);
    },
    onError
  );
}

/**
 * Creates a note. Deliberately bypasses the shared `service.create()` helper
 * (which stamps `createdAt: serverTimestamp()`) and uses `Timestamp.now()`
 * instead. `serverTimestamp()` resolves to `null` locally until the write
 * round-trips to the server, and the teacher's Notes list queries with
 * `orderBy("createdAt", "desc")` — a query ordered on a field that's still
 * null for a pending write doesn't get an optimistic local entry, so the
 * note only showed up after the network round-trip finished (the "note
 * doesn't instantly appear" bug). `Timestamp.now()` is a concrete value
 * from the moment of creation, so the optimistic local write is included in
 * the ordered snapshot immediately, and it's still the same Firestore
 * `Timestamp` type as `serverTimestamp()` resolves to, so it sorts
 * correctly alongside older notes.
 */
export async function createNote(data: {
  studentId: string;
  classId: string;
  authorId: string;
  content: string;
  sentiment: NoteSentiment;
  visibleToParent: boolean;
  sessionId?: string;
}) {
  const docRef = await addDoc(collection(db, "notes"), {
    ...data,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
}

export async function deleteNote(id: string) {
  return service.remove(id);
}

/** One-off (non-realtime) fetch of a student's notes within a date range, for report emails. */
export async function getNotesForStudentInRange(
  studentId: string,
  startMs: number,
  endMs: number
): Promise<NoteRecord[]> {
  const snapshot = await getDocs(
    query(collection(db, "notes"), where("studentId", "==", studentId))
  );
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as NoteRecord))
    .filter((n) => {
      const created = toMillis(n.createdAt);
      return created >= startMs && created <= endMs;
    });
}
