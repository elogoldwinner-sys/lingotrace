import { createFirestoreService } from "../firestoreService";
import type { NoteRecord } from "../../types";

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
      const sorted = [...notes].sort((a, b) => (b.createdAt as number) - (a.createdAt as number));
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
  visibleToParent: boolean;
}) {
  return service.create(data as Omit<NoteRecord, "id" | "createdAt">);
}

export async function deleteNote(id: string) {
  return service.remove(id);
}
