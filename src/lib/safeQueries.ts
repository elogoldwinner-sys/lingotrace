import { getDocs, type Query, type QuerySnapshot } from "firebase/firestore";

/**
 * Firestore rules are not filters: a query is rejected unless the filters it contains PROVE that
 * every document it could return is readable by the current user. A broad `studentId == X` query
 * therefore fails for a teacher (their access comes from owning the class / authoring the record),
 * while it is fine for the linked parent (access comes from the studentId itself).
 *
 * So reports run one narrow query per kind of access and merge the results:
 *   - the "teacher" query adds a filter the teacher's rule can verify (classId / awardedBy / authorId)
 *   - the "parent" query is the plain studentId query
 * A query the current user isn't allowed to run is simply ignored. The call only fails when EVERY
 * query is denied, and the error then says which collection and why.
 */
export async function getDocsFromAny<T extends { id: string }>(label: string, queries: Query[]): Promise<T[]> {
  const results = await Promise.allSettled(queries.map((q) => getDocs(q)));
  const ok = results.filter((r): r is PromiseFulfilledResult<QuerySnapshot> => r.status === "fulfilled");
  if (ok.length === 0) {
    const codes = results.map((r) => {
      const reason = (r as PromiseRejectedResult).reason;
      return reason?.code || reason?.message || "failed";
    });
    throw new Error(`Could not read ${label} (v4: ${codes.join(" | ")})`);
  }
  const byId = new Map<string, T>();
  ok.forEach((r) => r.value.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as unknown as T)));
  return Array.from(byId.values());
}
