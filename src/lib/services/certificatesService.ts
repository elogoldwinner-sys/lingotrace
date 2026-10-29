import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import { toMillis } from "../timestamps";
import type { CertificateRecord, PointsTransaction, StudentRecord } from "../../types";
import { getBadgeDefinition } from "./badgesService";
import type { CertificateRenderData } from "../certificate";

const service = createFirestoreService<CertificateRecord>("certificates");

/** The school year is taken to start on 1 August (0-based month). Change this one number if your year starts later. */
const SCHOOL_YEAR_START_MONTH = 7;

export function schoolYearStart(now = new Date()): number {
  const year = now.getMonth() >= SCHOOL_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, SCHOOL_YEAR_START_MONTH, 1).getTime();
}

const newestFirst = (items: CertificateRecord[]) =>
  [...items].sort((a, b) => (toMillis(b.createdAt) || Number.MAX_SAFE_INTEGER) - (toMillis(a.createdAt) || Number.MAX_SAFE_INTEGER));

/** A student's certificates (parent / student portal), newest first. */
export function subscribeToStudentCertificates(
  studentId: string,
  onData: (items: CertificateRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe([service.where("studentId", "==", studentId)], (items) => onData(newestFirst(items)), onError);
}

/** The certificates this teacher issued in a class (teacher side). */
export function subscribeToIssuedCertificates(
  classId: string,
  teacherId: string,
  onData: (items: CertificateRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("classId", "==", classId), service.where("issuedBy", "==", teacherId)],
    (items) => onData(newestFirst(items)),
    onError
  );
}

export async function issueCertificates(records: Omit<CertificateRecord, "id" | "createdAt">[]) {
  return service.createMany(records);
}

export async function deleteCertificate(id: string) {
  return service.remove(id);
}

export interface CertificateStats {
  points: number;
  rank: number | null;
  classSize: number | null;
  badgeIds: string[];
}

/**
 * Works out, for each selected student: their total points on the platform and
 * their position among ALL students of the class by points earned since the
 * start of the school year (ties share a position). If the points log can't be
 * read, the running totals are used instead.
 */
export async function computeCertificateStats(
  classId: string,
  teacherId: string,
  roster: StudentRecord[],
  selected: StudentRecord[]
): Promise<Map<string, CertificateStats>> {
  const since = schoolYearStart();
  const earned = new Map<string, number>(roster.map((s) => [s.id, 0]));
  let logAvailable = true;
  try {
    const snap = await getDocs(
      query(collection(db, "pointsTransactions"), where("classId", "==", classId), where("awardedBy", "==", teacherId))
    );
    snap.docs.forEach((d) => {
      const txn = d.data() as PointsTransaction;
      if (!earned.has(txn.studentId) || toMillis(txn.createdAt) < since) return;
      earned.set(txn.studentId, (earned.get(txn.studentId) || 0) + (txn.amount || 0));
    });
  } catch (err) {
    console.error("Could not read the points log for certificate ranking; using totals instead.", err);
    logAvailable = false;
  }
  const score = (s: StudentRecord) => (logAvailable ? earned.get(s.id) || 0 : s.points || 0);

  const result = new Map<string, CertificateStats>();
  for (const student of selected) {
    const mine = score(student);
    const rank = 1 + roster.filter((other) => score(other) > mine).length;
    result.set(student.id, {
      points: student.points || 0,
      rank,
      classSize: roster.length,
      badgeIds: student.badgeIds || [],
    });
  }
  return result;
}

/** Turns a stored/prepared certificate into what the PDF generator draws. */
export function toRenderData(c: {
  studentName: string;
  reason: string;
  points: number;
  rank: number | null;
  classSize: number | null;
  badgeIds: string[];
}, logoUrl?: string): CertificateRenderData {
  return {
    logoUrl,
    studentName: c.studentName,
    reason: c.reason,
    points: c.points,
    rank: c.rank,
    classSize: c.classSize,
    badges: (c.badgeIds || [])
      .map((id) => getBadgeDefinition(id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({ icon: b.icon, name: b.name })),
  };
}
