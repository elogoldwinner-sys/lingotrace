import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import type { ProjectRecord } from "../../types";

const service = createFirestoreService<ProjectRecord>("projects");

export function subscribeToProjects(
  classId: string,
  onData: (projects: ProjectRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("classId", "==", classId), service.orderBy("createdAt", "desc")],
    onData,
    onError
  );
}

export async function createProject(data: {
  classId: string;
  teacherId: string;
  title: string;
  description?: string;
  deadline: string;
}) {
  return service.create(data as Omit<ProjectRecord, "id" | "createdAt">);
}

export async function deleteProject(id: string) {
  return service.remove(id);
}

/**
 * One-off (non-realtime) fetch of a single project by id — used by the
 * public `/submit/:projectId` page, which a student reaches directly via a
 * shared link rather than through a live class-scoped list.
 */
export async function getProjectOnce(id: string): Promise<ProjectRecord | null> {
  const snapshot = await getDoc(doc(db, "projects", id));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as ProjectRecord;
}

export function buildSubmissionUrl(projectId: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}submit/${projectId}`;
}

/** True once the given deadline (YYYY-MM-DD, end of that day) has fully passed. */
export function isDeadlinePassed(deadline: string): boolean {
  const end = new Date(`${deadline}T23:59:59`);
  return Date.now() > end.getTime();
}
