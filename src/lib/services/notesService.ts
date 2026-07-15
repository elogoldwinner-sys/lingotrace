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
