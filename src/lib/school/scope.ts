import type { ClassRecord, StaffAccess, StaffRole } from "../../types";

export const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
export const SECTIONS = "ABCDEFGHIJKL".split("");

export function classKeyOf(grade: number, section: string) {
  return `${grade}-${section.trim().toUpperCase()}`;
}

/** Best-effort guess of grade + section from a free-text class name ("5A", "Grade 5 B", "الصف 5/ب" …). */
export function guessGradeSection(name: string): { grade?: number; section?: string } {
  const m = name.match(/(\d{1,2})\s*[-/ ]?\s*([A-La-l])\b/) || name.match(/(\d{1,2})/);
  if (!m) return {};
  const grade = Number(m[1]);
  if (grade < 1 || grade > 12) return {};
  return { grade, section: m[2] && /[A-Za-z]/.test(m[2]) ? m[2].toUpperCase() : undefined };
}

export function isHeadLike(role: StaffRole) {
  return role === "departmentHead" || role === "supervisor" || role === "coordinator";
}

/** Same rule the Firestore security rules apply — used to decide which queries to run and what to show. */
export function staffCanSeeClass(a: Pick<StaffAccess, "role" | "subject" | "allClasses" | "grades" | "classKeys">, c: ClassRecord): boolean {
  if (a.role === "principal") return true;
  const subjectOk = (c.subject || "") === (a.subject || "");
  const inScope = !!a.allClasses || (c.grade != null && (a.grades || []).includes(c.grade)) || (!!c.classKey && (a.classKeys || []).includes(c.classKey));
  if (a.role === "departmentHead") return subjectOk;
  if (a.role === "counselor") return inScope;
  return subjectOk && inScope; // supervisor / coordinator
}

export function classLabel(c: ClassRecord): string {
  return c.classKey ? c.classKey : c.name;
}

export function groupByGrade(classes: ClassRecord[]) {
  const grades = new Map<number, Map<string, ClassRecord[]>>();
  for (const c of classes) {
    if (c.grade == null || !c.section) continue;
    const g = grades.get(c.grade) || new Map<string, ClassRecord[]>();
    const list = g.get(c.section) || [];
    list.push(c);
    g.set(c.section, list);
    grades.set(c.grade, g);
  }
  return grades;
}
