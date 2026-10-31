import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import {
  getMembership,
  getSchool,
  getSchoolAssets,
  getStaffAccess,
  syncClassesToSchool,
} from "../lib/services/schoolService";
import type { School, SchoolAssets, SchoolTeacher, StaffAccess } from "../types";

interface SchoolContextValue {
  /** The school-portal access this Gmail has (principal / head / counselor …), if any. */
  staff: StaffAccess | null;
  /** This teacher's request to belong to a school (pending / approved / rejected), if any. */
  membership: SchoolTeacher | null;
  /** The school the person belongs to — through staff access or teacher membership. */
  school: School | null;
  /** Signature / stamp images (staff only). */
  assets: SchoolAssets;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SchoolContext = createContext<SchoolContextValue | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [staff, setStaff] = useState<StaffAccess | null>(null);
  const [membership, setMembership] = useState<SchoolTeacher | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [assets, setAssets] = useState<SchoolAssets>({});
  const [loading, setLoading] = useState(true);
  const token = useRef(0);

  const load = useCallback(async () => {
    const mine = ++token.current;
    if (!user) {
      setStaff(null);
      setMembership(null);
      setSchool(null);
      setAssets({});
      setLoading(false);
      return;
    }
    const [staffDoc, memberDoc] = await Promise.all([
      user.email ? getStaffAccess(user.email).catch(() => null) : Promise.resolve(null),
      getMembership(user.uid).catch(() => null),
    ]);
    const schoolId = staffDoc?.schoolId || memberDoc?.schoolId;
    const [schoolDoc, assetDoc] = await Promise.all([
      schoolId ? getSchool(schoolId).catch(() => null) : Promise.resolve(null),
      staffDoc ? getSchoolAssets(staffDoc.schoolId) : Promise.resolve({}),
    ]);
    if (mine !== token.current) return;
    setStaff(staffDoc);
    setMembership(memberDoc);
    setSchool(schoolDoc);
    setAssets(assetDoc);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    load();
  }, [authLoading, load]);

  // Once the principal approves a teacher, attach that teacher's classes to the school (once per session).
  useEffect(() => {
    if (!profile || !membership || !school || membership.status !== "approved" || membership.schoolId !== school.id) return;
    const key = `lt-school-sync:${membership.uid}:${school.id}:${school.subjects.join("|")}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    syncClassesToSchool(membership, school).catch((err) => {
      console.error("Couldn't attach classes to the school", err);
      sessionStorage.removeItem(key);
    });
  }, [profile, membership, school]);

  return (
    <SchoolContext.Provider value={{ staff, membership, school, assets, loading, refresh: load }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchool must be used within a SchoolProvider");
  return ctx;
}

/** Teachers: may the school's teachers use "compare across subjects"? (Default yes; always yes outside a school.) */
export function useSubjectCompareAllowed() {
  const { school, membership } = useSchool();
  if (!school || !membership || membership.status !== "approved") return true;
  return school.allowSubjectCompare !== false;
}
