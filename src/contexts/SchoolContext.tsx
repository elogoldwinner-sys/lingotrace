import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { getEntitlements, subscribeEntitlements } from "../lib/services/entitlementsService";
import type { FeatureKey, LimitKey } from "../lib/features";
import {
  getMembership,
  getSchool,
  getSchoolAssets,
  getStaffAccess,
  syncClassesToSchool,
} from "../lib/services/schoolService";
import type { School, SchoolAssets, SchoolEntitlements, SchoolTeacher, StaffAccess } from "../types";

interface SchoolContextValue {
  /** The school-portal access this Gmail has (principal / head / counselor …), if any. */
  staff: StaffAccess | null;
  /** This teacher's request to belong to a school (pending / approved / rejected), if any. */
  membership: SchoolTeacher | null;
  /** The school the person belongs to — through staff access or teacher membership. */
  school: School | null;
  /** Signature / stamp images (staff only). */
  assets: SchoolAssets;
  /** What the platform admin has switched on for the school (basic plan when nothing is set). */
  entitlements: SchoolEntitlements | null;
  /** Set when the plan could not be read (e.g. "permission-denied"): the school is then treated as basic. */
  entitlementsError: string | null;
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
  const [entitlements, setEntitlements] = useState<SchoolEntitlements | null>(null);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const token = useRef(0);

  const load = useCallback(async () => {
    const mine = ++token.current;
    if (!user) {
      setStaff(null);
      setMembership(null);
      setSchool(null);
      setAssets({});
      setEntitlements(null);
      setLoading(false);
      return;
    }
    const [staffDoc, memberDoc] = await Promise.all([
      user.email ? getStaffAccess(user.email).catch(() => null) : Promise.resolve(null),
      getMembership(user.uid).catch(() => null),
    ]);
    const schoolId = staffDoc?.schoolId || memberDoc?.schoolId;
    const [schoolDoc, assetDoc, entDoc] = await Promise.all([
      schoolId ? getSchool(schoolId).catch(() => null) : Promise.resolve(null),
      staffDoc ? getSchoolAssets(staffDoc.schoolId) : Promise.resolve({}),
      schoolId ? getEntitlements(schoolId) : Promise.resolve(null),
    ]);
    if (mine !== token.current) return;
    setStaff(staffDoc);
    setMembership(memberDoc);
    setSchool(schoolDoc);
    setAssets(assetDoc);
    setEntitlements(entDoc);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    load();
  }, [authLoading, load]);

  // Live plan: the moment the admin changes a switch, everyone signed in at that school sees it (no reload needed).
  // If the plan can't be read we say why (shown on the lock badges) and fall back to the basic plan.
  const planSchoolId = school?.id;
  useEffect(() => {
    if (!planSchoolId) return;
    return subscribeEntitlements(
      planSchoolId,
      (fresh) => {
        setEntitlements(fresh);
        setEntitlementsError(null);
      },
      (err) => {
        console.error(`Couldn't read the plan of school ${planSchoolId}`, err);
        setEntitlementsError((err as { code?: string }).code || "unknown");
      }
    );
  }, [planSchoolId]);

  // A teacher waiting for approval picks the decision up as soon as they come back to the tab.
  useEffect(() => {
    if (membership?.status !== "pending") return;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [membership?.status, load]);

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
    <SchoolContext.Provider value={{ staff, membership, school, assets, entitlements, entitlementsError, loading, refresh: load }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchool must be used within a SchoolProvider");
  return ctx;
}

/**
 * Is a platform-admin-controlled feature available to this person?
 *  - Someone who belongs to a school (school-portal staff, or a teacher the principal approved) gets exactly what the
 *    admin switched on for that school.
 *  - A teacher who is not part of a school is not governed by a school plan and keeps everything.
 *  - While the school is still loading we don't lock anything (the security rules are the real gate for writes).
 * This hides / fades UI; data that must not be written without the feature is also checked in firestore.rules.
 */
export function useFeature(key: FeatureKey): boolean {
  const { school, staff, membership, entitlements, loading } = useSchool();
  if (loading) return true;
  const governed = !!school && (!!staff || (membership?.status === "approved" && membership.schoolId === school.id));
  if (!governed) return true;
  return entitlements?.features[key] === true;
}

/**
 * The cap the admin set for this person's school (null = unlimited). Teachers outside a school are never capped.
 * While loading nothing is capped. Enforced in the app only — Firestore rules can't count documents.
 */
export function useLimit(key: LimitKey): number | null {
  const { school, staff, membership, entitlements, loading } = useSchool();
  if (loading) return null;
  const governed = !!school && (!!staff || (membership?.status === "approved" && membership.schoolId === school.id));
  if (!governed) return null;
  return entitlements ? entitlements.limits[key] : null;
}

/** Is the current person governed by a school plan at all, and are they its principal? (Decides the lock tooltip.) */
export function useFeatureAudience(): { governed: boolean; isPrincipal: boolean } {
  const { school, staff, membership } = useSchool();
  const governed = !!school && (!!staff || membership?.status === "approved");
  return { governed, isPrincipal: staff?.role === "principal" };
}

/** Teachers: may the school's teachers use "compare across subjects"? (Default yes; always yes outside a school.) */
export function useSubjectCompareAllowed() {
  const { school, membership } = useSchool();
  if (!school || !membership || membership.status !== "approved") return true;
  return school.allowSubjectCompare !== false;
}

/**
 * The logo to show and print for this teacher. Once the principal has approved the teacher, the SCHOOL's logo
 * (set by the principal) is used everywhere and the teacher can no longer change it; otherwise the teacher's own logo.
 */
export function useEffectiveSchoolLogo(): { logo: string | undefined; locked: boolean } {
  const { school, membership } = useSchool();
  const { profile } = useAuth();
  const member = !!school && !!membership && membership.status === "approved" && membership.schoolId === school.id;
  if (member && school!.logoURL) return { logo: school!.logoURL, locked: true };
  return { logo: profile?.schoolLogoURL, locked: false };
}
