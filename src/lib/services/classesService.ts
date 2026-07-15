import { createFirestoreService } from "../firestoreService";
import type { ClassRecord } from "../../types";

const service = createFirestoreService<ClassRecord>("classes");

export function subscribeToClasses(
  teacherId: string,
  onData: (classes: ClassRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("teacherId", "==", teacherId)],
    onData,
    onError
  );
}

export async function createClass(data: {
  name: string;
  description?: string;
  teacherId: string;
  color?: string;
}) {
  return service.create({ ...data, studentIds: [] } as Omit<ClassRecord, "id" | "createdAt">);
}

export async function updateClass(id: string, data: Partial<ClassRecord>) {
  return service.update(id, data);
}

export async function deleteClass(id: string) {
  return service.remove(id);
}
