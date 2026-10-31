import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { toMillis } from "../timestamps";
import { allFeaturesOff, FEATURE_KEYS, FREE_LIMITS, LIMIT_KEYS, type FeatureMap, type LimitMap } from "../features";
import type { AdminLogEntry, SchoolEntitlements, SchoolPlan } from "../../types";

/** The plain default: free plan, nothing extra switched on. */
export const defaultEntitlements = (schoolId: string): SchoolEntitlements => ({
  schoolId,
  plan: "free",
  features: allFeaturesOff(),
  limits: { ...FREE_LIMITS },
});

function normalise(schoolId: string, data: Record<string, unknown> | undefined): SchoolEntitlements {
  if (!data) return defaultEntitlements(schoolId);
  const raw = (data.features || {}) as Record<string, unknown>;
  const features = allFeaturesOff();
  for (const k of FEATURE_KEYS) features[k] = raw[k] === true;
  // A missing limits map means "basic limits"; an explicit null means unlimited.
  const rawLimits = (data.limits || {}) as Record<string, unknown>;
  const limits = { ...FREE_LIMITS } as LimitMap;
  for (const k of LIMIT_KEYS) {
    const v = rawLimits[k];
    if (v === null) limits[k] = null;
    else if (typeof v === "number" && v >= 0) limits[k] = Math.floor(v);
  }
  return {
    schoolId,
    plan: data.plan === "paid" ? "paid" : "free",
    features,
    limits,
    updatedAt: data.updatedAt ? toMillis(data.updatedAt as never) : undefined,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
  };
}

/** Never throws: if the doc can't be read the school simply gets the basic plan (fail closed). */
export async function getEntitlements(schoolId: string): Promise<SchoolEntitlements> {
  try {
    const snap = await getDoc(doc(db, "schoolEntitlements", schoolId));
    return normalise(schoolId, snap.exists() ? snap.data() : undefined);
  } catch (err) {
    console.error("Couldn't read the school's entitlements", err);
    return defaultEntitlements(schoolId);
  }
}

/** Admin: every school's entitlements, keyed by school id. */
export async function listAllEntitlements(): Promise<Record<string, SchoolEntitlements>> {
  const snap = await getDocs(collection(db, "schoolEntitlements"));
  const out: Record<string, SchoolEntitlements> = {};
  snap.docs.forEach((d) => (out[d.id] = normalise(d.id, d.data())));
  return out;
}

/** Admin only (enforced by the security rules). Writes the whole set so the doc never holds stale keys. */
export async function saveEntitlements(
  school: { id: string; name: string },
  input: { plan: SchoolPlan; features: FeatureMap; limits: LimitMap },
  adminEmail: string,
  logDetail: string
) {
  const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, input.features[k] === true]));
  await setDoc(doc(db, "schoolEntitlements", school.id), {
    schoolId: school.id,
    plan: input.plan,
    features,
    limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, input.limits[k] ?? null])),
    updatedAt: serverTimestamp(),
    updatedBy: adminEmail,
  });
  await addDoc(collection(db, "adminLog"), {
    schoolId: school.id,
    schoolName: school.name,
    action: "entitlements_changed",
    detail: logDetail,
    createdAt: serverTimestamp(),
  }).catch((err) => console.error("Admin log write failed", err));
}

export async function listAdminLog(schoolId?: string, max = 50): Promise<AdminLogEntry[]> {
  const base = collection(db, "adminLog");
  const snap = await getDocs(
    schoolId ? query(base, where("schoolId", "==", schoolId), limit(max)) : query(base, orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as AdminLogEntry), id: d.id, createdAt: toMillis(d.data().createdAt) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}


/** The admin's private note about a school (separate collection: the school can read its own entitlements, never this). */
export async function getAdminNote(schoolId: string): Promise<string> {
  const snap = await getDoc(doc(db, "adminNotes", schoolId));
  return snap.exists() ? String(snap.data().note || "") : "";
}

export async function saveAdminNote(schoolId: string, note: string) {
  await setDoc(doc(db, "adminNotes", schoolId), { note, updatedAt: serverTimestamp() });
}
