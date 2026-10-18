import { useEffect, useState } from "react";
import { buildLinkedRef, subscribeToMarkAward } from "../services/linkedActivityService";

/**
 * Which of the given exams/games already had their mark added to this student's
 * points. The portals hide those (the points stay in the student's record).
 * `ready` turns true once every answer is in, so nothing flashes on screen
 * only to disappear a moment later.
 */
export function useAwardedAssignmentIds(assignmentIds: string[], studentId: string) {
  const [state, setState] = useState<Record<string, boolean>>({});
  const idsKey = assignmentIds.join("|");

  useEffect(() => {
    const unsubs = idsKey
      .split("|")
      .filter(Boolean)
      .map((assignmentId) => {
        const ref = buildLinkedRef(assignmentId, studentId);
        return subscribeToMarkAward(assignmentId, studentId, (award) =>
          setState((prev) => (prev[ref] === !!award ? prev : { ...prev, [ref]: !!award }))
        );
      });
    return () => unsubs.forEach((u) => u());
  }, [idsKey, studentId]);

  const ready = assignmentIds.every((id) => buildLinkedRef(id, studentId) in state);
  const awardedIds = new Set(assignmentIds.filter((id) => state[buildLinkedRef(id, studentId)]));
  return { awardedIds, ready };
}
