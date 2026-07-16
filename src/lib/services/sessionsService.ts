import { addDays, format, parseISO } from "date-fns";
import { createFirestoreService } from "../firestoreService";
import type { SessionRecord } from "../../types";

const service = createFirestoreService<SessionRecord>("sessions");

/**
 * Sunday-first weekday counts for bulk generation, e.g. `[2, 1, 0, 1, 0]`
 * means: 2 sessions every Sunday, 1 every Monday, 0 Tuesdays, 1 every
 * Wednesday, 0 Thursdays. Index 0 = Sunday … index 4 = Thursday (the app's
 * 5-day school week). Fridays/Saturdays are never scheduled.
 */
export type WeekdaySessionCounts = [number, number, number, number, number];

export interface BulkSessionInput {
  classId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weekdayCounts: WeekdaySessionCounts;
  titlePrefix: string;
  topic?: string;
  objectives?: string;
}

/** Pure date-math helper (exported for testing) — builds the list of session drafts a bulk-generate request will create. */
export function buildBulkSessionDrafts(
  input: BulkSessionInput
): Omit<SessionRecord, "id" | "createdAt">[] {
  const drafts: Omit<SessionRecord, "id" | "createdAt">[] = [];
  const start = parseISO(input.startDate);
  const end = parseISO(input.endDate);
  if (start > end) return drafts;

  let cursor = start;
  while (cursor <= end) {
    const jsDay = cursor.getDay(); // 0=Sun..6=Sat
    if (jsDay >= 0 && jsDay <= 4) {
      const count = input.weekdayCounts[jsDay] || 0;
      const dateStr = format(cursor, "yyyy-MM-dd");
      for (let slot = 1; slot <= count; slot++) {
        drafts.push({
          classId: input.classId,
          title: count > 1 ? `${input.titlePrefix} (${slot})` : input.titlePrefix,
          date: dateStr,
          topic: input.topic,
          objectives: input.objectives,
        });
      }
    }
    cursor = addDays(cursor, 1);
  }
  return drafts;
}

export async function createSessionsBulk(input: BulkSessionInput) {
  const drafts = buildBulkSessionDrafts(input);
  if (drafts.length === 0) return [];
  return service.createMany(drafts);
}

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
