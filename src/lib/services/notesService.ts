import { collection, getDocs, query, where } from "firebase/firestore";
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

export async function createNote(data: {
  studentId: string;
  classId: string;
  authorId: string;
  content: string;
  sentiment: NoteSentiment;
  visibleToParent: boolean;
  sessionId?: string;
}) {
  return service.create(data as Omit<NoteRecord, "id" | "createdAt">);
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
