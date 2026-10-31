import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useSchool } from "../../contexts/SchoolContext";
import {
  listMemberships,
  syncClassesToSchool,
  loadClassPoints,
  loadClassStudents,
  loadScopedClasses,
  logAudit,
} from "../../lib/services/schoolService";
import { toTxn, type Txn } from "../../lib/reports/pointsStats";
import type { AuditAction, ClassRecord, SchoolTeacher, StudentRecord } from "../../types";

interface SchoolDataValue {
  classes: ClassRecord[];
  teachers: SchoolTeacher[];
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
  teacherName: (c: ClassRecord) => string;
  getStudents: (classId: string) => Promise<StudentRecord[]>;
  getTxns: (classId: string) => Promise<Txn[]>;
  audit: (action: AuditAction, target: string, period?: string) => void;
}

const Ctx = createContext<SchoolDataValue | undefined>(undefined);

/** Everything the signed-in staff member is allowed to see, loaded on demand and cached for the session. */
export function SchoolDataProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { staff, school } = useSchool();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const students = useRef(new Map<string, Promise<StudentRecord[]>>());
  const points = useRef(new Map<string, Promise<Txn[]>>());

  const reload = useCallback(async () => {
    if (!staff) return;
    setLoading(true);
    setError(false);
    students.current.clear();
    points.current.clear();
    try {
      const [cls, mem] = await Promise.all([
        loadScopedClasses(staff),
        listMemberships(staff.schoolId, staff.role === "departmentHead" ? staff.subject : undefined).catch(() => [] as SchoolTeacher[]),
      ]);
      setClasses(cls);
      setTeachers(mem);
      // Principal: make sure every approved teacher's classes carry the school / grade / section / subject
      // (older classes, or teachers who haven't reopened the app since being approved). Once per teacher per session.
      if (staff.role === "principal" && school) {
        let changed = 0;
        for (const m of mem.filter((x) => x.status === "approved")) {
          const key = `lt-principal-sync:${school.id}:${m.uid}:${school.subjects.join("|")}`;
          if (sessionStorage.getItem(key)) continue;
          sessionStorage.setItem(key, "1");
          try {
            changed += await syncClassesToSchool(m, school);
          } catch (err) {
            console.error("Couldn't attach a teacher's classes", err);
            sessionStorage.removeItem(key);
          }
        }
        if (changed > 0) setClasses(await loadScopedClasses(staff));
      }
    } catch (err) {
      console.error("Couldn't load the school's classes", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [staff, school]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<SchoolDataValue>(() => {
    const byUid = new Map(teachers.map((m) => [m.uid, m]));
    return {
      classes,
      teachers,
      loading,
      error,
      reload,
      teacherName: (c) => byUid.get(c.teacherId)?.name || c.teacherEmail || c.ownerName || "—",
      getStudents: (id) => {
        let p = students.current.get(id);
        if (!p) {
          p = loadClassStudents(id);
          students.current.set(id, p);
          p.catch(() => students.current.delete(id));
        }
        return p;
      },
      getTxns: (id) => {
        let p = points.current.get(id);
        if (!p) {
          p = loadClassPoints(id).then((rows) => rows.map(toTxn));
          points.current.set(id, p);
          p.catch(() => points.current.delete(id));
        }
        return p;
      },
      audit: (action, target, period) => {
        if (!staff || !user || !school) return;
        logAudit(school.id, {
          actorUid: user.uid,
          actorName: profile?.displayName || user.displayName || staff.displayName || user.email || "",
          actorEmail: user.email || "",
          actorRole: staff.role,
          action,
          target,
          ...(period ? { period } : {}),
        });
      },
    };
  }, [classes, teachers, loading, error, reload, staff, user, profile, school]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSchoolData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSchoolData must be used within SchoolDataProvider");
  return ctx;
}
