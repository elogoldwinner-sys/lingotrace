import { createFirestoreService } from "../firestoreService";
import type { SessionRecord } from "../../types";

const service = createFirestoreService<SessionRecord>("sessions");

export function subscribeToSessions(
  classId: string,
  onData: (sessions: SessionRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("classId", "==", classId), service.orderBy("date", "desc")],
    onData,
    onError
  );
}

export async function createSession(data: {
  classId: string;
  title: string;
  date: string;
  topic?: string;
  objectives?: string;
}) {
  return service.create(data as Omit<SessionRecord, "id" | "createdAt">);
}

export async function updateSession(id: string, data: Partial<SessionRecord>) {
  return service.update(id, data);
}

export async function deleteSession(id: string) {
  return service.remove(id);
}
