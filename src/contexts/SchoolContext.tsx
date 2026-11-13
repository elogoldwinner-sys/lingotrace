import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useLocation } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { subscribeEntitlements } from "../lib/services/entitlementsService";
import type { FeatureKey, LimitKey } from "../lib/features";
import {
  acceptReplacement,
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
  /** The school this teacher is an APPROVED member of, kept live (so the principal's schedule changes show up without a reload). */
  memberSchool: School | null;
  /** Signature / stamp images (staff only). */
  assets: SchoolAssets;
  /** Plans (what the platform admin switched on) of the schools this person is connected to, by school id. */
  plans: Record<string, SchoolEntitlements>;
  /** Per school id: why its plan could not be read (e.g. "permission-denied"); such a school is treated as basic. */
  planErrors: Record<string, string>;
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
  const [memberSchool, setMemberSchool] = useState<School | null>(null);
  const [plans, setPlans] = useState<Record<string, SchoolEntitlements>>({});
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
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
    // A principal may have handed classes to this Gmail: that makes the person an approved teacher right away.
    let member = memberDoc;
    if (user.email && member?.status !== "approved") {
      const joined = await acceptReplacement({ uid: user.uid, email: user.email, displayName: user.displayName }, member).catch((err) => {
        console.error("Couldn't accept the teacher hand-over", err);
        return null;
      });
      if (joined) member = joined;
    }
    const schoolId = staffDoc?.schoolId || member?.schoolId;
    const [schoolDoc, assetDoc] = await Promise.all([
      schoolId ? getSchool(schoolId).catch(() => null) : Promise.resolve(null),
      staffDoc ? getSchoolAssets(staffDoc.schoolId) : Promise.resolve({}),
    ]);
    if (mine !== token.current) return;
    setStaff(staffDoc);
    setMembership(member);
    setSchool(schoolDoc);
    setAssets(assetDoc);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    load();
  }, [authLoading, load]);

  // Live plans. A Gmail can be connected to TWO schools (staff of one, an approved teacher in another), so we follow the
  // plan of each. The moment the admin changes a switch it reaches everyone signed in; if a plan can't be read we say
  // why (shown on the lock badges) and treat that school as basic.
  const staffSchoolId = staff?.schoolId || "";
  const memberSchoolId = membership?.status === "approved" ? membership.schoolId : "";
  useEffect(() => {
    const ids = Array.from(new Set([staffSchoolId, memberSchoolId].filter(Boolean)));
    const unsubs = ids.map((id) =>
      subscribeEntitlements(
        id,
        (fresh) => {
          setPlans((prev) => ({ ...prev, [id]: fresh }));
          setPlanErrors((prev) => {
            if (!(id in prev)) return prev;
            const { [id]: _gone, ...rest } = prev;
            return rest;
          });
        },
        (err) => {
          console.error(`Couldn't read the plan of school ${id}`, err);
          setPlanErrors((prev) => ({ ...prev, [id]: (err as { code?: string }).code || "unknown" }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [staffSchoolId, memberSchoolId]);

  // The teacher's own school, live. It can differ from `school` (a Gmail that is staff of one school and a teacher in
  // another gets the staff school there), and the principal can change things after the teacher signed in.
  useEffect(() => {
    if (!memberSchoolId) {
      setMemberSchool(null);
      return;
    }
    return onSnapshot(
      doc(db, "schools", memberSchoolId),
      (snap) => setMemberSchool(snap.exists() ? ({ ...(snap.data() as School), id: snap.id }) : null),
      (err) => console.error("Couldn't read the teacher's school", err)
    );
  }, [memberSchoolId]);

  // Re-read the person's access whenever they come back to the tab: a teacher waiting for approval picks the decision
  // up, and a person whose access was removed (or added) stops seeing — or starts seeing — the old role without a
  // manual reload. Without this the tab keeps showing a role that no longer exists in the database.
  const watching = membership?.status === "pending" || !!staff;
  useEffect(() => {
    if (!watching) return;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [watching, load]);

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
    <SchoolContext.Provider value={{ staff, membership, school, memberSchool, assets, plans, planErrors, loading, refresh: load }}>
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
 * Which school's plan applies right now, and what is it?
 *  - In the school portal (/school…) it is the school this person WORKS FOR (their staff access).
 *  - Everywhere else (the teacher portal) it is the school the principal APPROVED them as a teacher of.
 *  A person connected to two schools therefore gets each portal governed by the right school. A teacher who is not
 *  an approved member of any school is not governed by a plan and keeps everything.
 */
function usePlan(): { governed: boolean; pending: boolean; plan: SchoolEntitlements | null; error: string | null; inSchoolPortal: boolean } {
  const { staff, membership, plans, planErrors, loading } = useSchool();
  const { pathname } = useLocation();
  const inSchoolPortal = pathname.startsWith("/school");
  const id = inSchoolPortal ? staff?.schoolId || "" : membership?.status === "approved" ? membership.schoolId : "";
  if (!id) return { governed: false, pending: false, plan: null, error: null, inSchoolPortal };
  const plan = plans[id] || null;
  const error = planErrors[id] || null;
  // Until the first answer arrives we don't lock anything (the security rules are the real gate for writes).
  return { governed: true, pending: loading || (!plan && !error), plan, error, inSchoolPortal };
}

/** Is a platform-admin-controlled feature available to this person? Fades UI; rules also guard the data that matters. */
export function useFeature(key: FeatureKey): boolean {
  const { governed, pending, plan } = usePlan();
  if (!governed || pending) return true;
  return plan?.features[key] === true;
}

/** The cap the admin set for this person's school (null = unlimited). Enforced in the app only — rules can't count. */
export function useLimit(key: LimitKey): number | null {
  const { governed, pending, plan } = usePlan();
  if (!governed || pending || !plan) return null;
  return plan.limits[key];
}

/** Decides the lock tooltip: is the person a principal in the school portal, and could the plan not be read? */
export function useFeatureAudience(): { governed: boolean; isPrincipal: boolean; planError: string | null } {
  const { staff } = useSchool();
  const { governed, error, inSchoolPortal } = usePlan();
  return { governed, isPrincipal: inSchoolPortal && staff?.role === "principal", planError: error };
}

/** Teachers: may the school's teachers use "compare across subjects"? (Default yes; always yes outside a school.) */
export function useSubjectCompareAllowed() {
  const { school, membership } = useSchool();
  if (!school || !membership || membership.status !== "approved") return true;
  return school.allowSubjectCompare !== false;
}

/**
 * Teachers: are automatic parent alerts on? Needs ALL of: the teacher is an approved member of a school, the admin
 * enabled the "parentAlerts" feature for it, and the principal switched the school setting on. Off everywhere else.
 */
export function useParentAlertsEnabled(): boolean {
  const { memberSchool, membership } = useSchool();
  const featureOn = useFeature("parentAlerts");
  if (!memberSchool || !membership || membership.status !== "approved") return false;
  return featureOn && memberSchool.autoNotifyParents === true;
}

/**
 * The logo to show and print for this teacher. Once the principal has approved the teacher, the logo is the one the
 * principal chose for the SCHOOL (read live from the teacher's own school, so a change shows up without a reload) and
 * the teacher can no longer change it. While the school has no logo yet, a logo the teacher saved earlier keeps being
 * shown (read-only). A teacher who is not an approved member of a school manages their own logo as before.
 */
export function useEffectiveSchoolLogo(): { logo: string | undefined; locked: boolean } {
  const { memberSchool, membership } = useSchool();
  const { profile } = useAuth();
  if (membership?.status === "approved") {
    return { logo: memberSchool?.logoURL || profile?.schoolLogoURL || undefined, locked: true };
  }
  return { logo: profile?.schoolLogoURL, locked: false };
}
