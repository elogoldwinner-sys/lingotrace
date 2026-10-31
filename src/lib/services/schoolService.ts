import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";
import { classKeyOf } from "../school/scope";
import { toMillis } from "../timestamps";
import type {
  AuditEntry,
  ClassRecord,
  FeedbackLogEntry,
  PointsTransaction,
  School,
  SchoolAssets,
  SchoolTeacher,
  StaffAccess,
  StudentRecord,
  TeacherMembershipStatus,
} from "../../types";

export const normEmail = (email: string) => email.trim().toLowerCase();

/* ───────────────────────────── schools ───────────────────────────── */

export async function getSchool(id: string): Promise<School | null> {
  const snap = await getDoc(doc(db, "schools", id));
  return snap.exists() ? ({ ...(snap.data() as School), id: snap.id }) : null;
}

export async function listSchools(): Promise<School[]> {
  const snap = await getDocs(collection(db, "schools"));
  return snap.docs.map((d) => ({ ...(d.data() as School), id: d.id })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The school id is the principal's uid, so a principal can only ever create one school. */
export async function createSchool(input: {
  uid: string;
  email: string;
  displayName: string;
  name: string;
  logoURL?: string;
  subjects: string[];
}) {
  const email = normEmail(input.email);
  await setDoc(doc(db, "schools", input.uid), {
    name: input.name.trim(),
    logoURL: input.logoURL || null,
    principalUid: input.uid,
    principalName: input.displayName,
    principalEmail: email,
    subjects: input.subjects,
    allowSubjectCompare: true,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "staffAccess", email), {
    email,
    schoolId: input.uid,
    role: "principal",
    displayName: input.displayName,
    addedByUid: input.uid,
    addedByRole: "principal",
    createdAt: serverTimestamp(),
  });
}

export async function updateSchool(id: string, patch: Partial<Omit<School, "id">>) {
  await updateDoc(doc(db, "schools", id), { ...patch } as DocumentData);
}

export async function getSchoolAssets(id: string): Promise<SchoolAssets> {
  try {
    const snap = await getDoc(doc(db, "schoolAssets", id));
    return snap.exists() ? (snap.data() as SchoolAssets) : {};
  } catch {
    return {};
  }
}

/** `undefined` values remove the image. */
export async function setSchoolAssets(id: string, patch: SchoolAssets) {
  const payload = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? deleteField()]));
  await setDoc(doc(db, "schoolAssets", id), payload, { merge: true });
}

/* ───────────────────────────── staff access ───────────────────────────── */

export async function getStaffAccess(email: string): Promise<StaffAccess | null> {
  const snap = await getDoc(doc(db, "staffAccess", normEmail(email)));
  return snap.exists() ? ({ ...(snap.data() as StaffAccess), id: snap.id }) : null;
}

export async function saveStaffAccess(a: Omit<StaffAccess, "id" | "createdAt">) {
  const email = normEmail(a.email);
  await setDoc(doc(db, "staffAccess", email), { ...a, email, createdAt: serverTimestamp() });
}

export async function updateStaffScope(email: string, patch: Partial<StaffAccess>) {
  await updateDoc(doc(db, "staffAccess", normEmail(email)), { ...patch } as DocumentData);
}

export async function removeStaffAccess(email: string) {
  await deleteDoc(doc(db, "staffAccess", normEmail(email)));
}

/** Principal: everyone in the school. Others: only the people they added themselves. */
export async function listStaff(schoolId: string, addedByUid?: string): Promise<StaffAccess[]> {
  const q = addedByUid
    ? query(collection(db, "staffAccess"), where("schoolId", "==", schoolId), where("addedByUid", "==", addedByUid))
    : query(collection(db, "staffAccess"), where("schoolId", "==", schoolId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as StaffAccess), id: d.id }));
}

/* ───────────────────────────── teacher membership ───────────────────────────── */

export async function getMembership(uid: string): Promise<SchoolTeacher | null> {
  const snap = await getDoc(doc(db, "schoolTeachers", uid));
  return snap.exists() ? ({ ...(snap.data() as SchoolTeacher), id: snap.id }) : null;
}

/** A teacher asks to join a school. Always created as "pending" — the security rules don't allow anything else. */
export async function requestMembership(input: {
  uid: string;
  schoolId: string;
  name: string;
  email: string;
  whatsapp?: string;
  subject: string;
  classMap: Record<string, { grade: number; section: string }>;
}) {
  const ref = doc(db, "schoolTeachers", input.uid);
  // Re-requesting (e.g. after a rejection) may only touch these four fields — see the security rules.
  if ((await getDoc(ref)).exists()) {
    await updateDoc(ref, { schoolId: input.schoolId, subject: input.subject, status: "pending", classMap: input.classMap });
    return;
  }
  await setDoc(ref, {
    uid: input.uid,
    schoolId: input.schoolId,
    name: input.name,
    email: normEmail(input.email),
    whatsapp: input.whatsapp || null,
    subject: input.subject,
    status: "pending",
    classMap: input.classMap,
    createdAt: serverTimestamp(),
  });
}

export async function updateMembershipContact(uid: string, patch: { whatsapp?: string; name?: string }) {
  await updateDoc(doc(db, "schoolTeachers", uid), { ...patch } as DocumentData);
}

export async function listMemberships(schoolId: string, subject?: string): Promise<SchoolTeacher[]> {
  const q = subject
    ? query(collection(db, "schoolTeachers"), where("schoolId", "==", schoolId), where("subject", "==", subject))
    : query(collection(db, "schoolTeachers"), where("schoolId", "==", schoolId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as SchoolTeacher), id: d.id }));
}

export async function setMembershipStatus(uid: string, status: TeacherMembershipStatus) {
  await updateDoc(doc(db, "schoolTeachers", uid), { status });
}

export async function removeMembership(uid: string) {
  await deleteDoc(doc(db, "schoolTeachers", uid));
}

/**
 * After approval: stamps the school, grade, section and subject on the
 * teacher's own classes so the school portal can see them. Classes created
 * while the request was pending already carry grade/section; older ones are
 * filled from the mapping the teacher chose when they joined.
 */
export async function syncClassesToSchool(m: SchoolTeacher, school: School): Promise<number> {
  const snap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", m.uid)));
  let changed = 0;
  const batch = writeBatch(db);
  for (const d of snap.docs) {
    const c = d.data() as ClassRecord;
    const grade = c.grade ?? m.classMap?.[d.id]?.grade;
    const section = c.section ?? m.classMap?.[d.id]?.section;
    if (grade == null || !section) continue;
    const subject = c.subject && school.subjects.includes(c.subject) ? c.subject : m.subject;
    const classKey = classKeyOf(grade, section);
    if (c.schoolId === school.id && c.grade === grade && c.section === section && c.classKey === classKey && c.subject === subject) continue;
    batch.update(d.ref, { schoolId: school.id, grade, section, classKey, subject });
    changed++;
  }
  if (changed > 0) await batch.commit();
  return changed;
}

/** Principal: detach a removed/rejected teacher's classes from the school (the rules only allow clearing the school link). */
export async function detachTeacherClasses(schoolId: string, teacherUid: string) {
  const snap = await getDocs(
    query(collection(db, "classes"), where("schoolId", "==", schoolId), where("teacherId", "==", teacherUid))
  );
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { schoolId: "" }));
    await batch.commit();
  }
}

/* ───────────────────────────── audit trail & feedback log ───────────────────────────── */

export async function logAudit(schoolId: string, entry: Omit<AuditEntry, "id" | "createdAt">) {
  try {
    await addDoc(collection(db, "schools", schoolId, "audit"), { ...entry, createdAt: serverTimestamp() });
  } catch (err) {
    // The trail must never block the person's actual work.
    console.error("Audit log write failed", err);
  }
}

export async function listAudit(schoolId: string, max = 300): Promise<AuditEntry[]> {
  const snap = await getDocs(query(collection(db, "schools", schoolId, "audit"), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((d) => ({ ...(d.data() as AuditEntry), id: d.id, createdAt: toMillis(d.data().createdAt) }));
}

export async function addFeedbackLog(schoolId: string, entry: Omit<FeedbackLogEntry, "id" | "createdAt">) {
  await addDoc(collection(db, "schools", schoolId, "feedback"), { ...entry, createdAt: serverTimestamp() });
}

export async function listFeedbackLog(schoolId: string, authorUid?: string, max = 300): Promise<FeedbackLogEntry[]> {
  const base = collection(db, "schools", schoolId, "feedback");
  const snap = await getDocs(
    authorUid ? query(base, where("authorUid", "==", authorUid), limit(max)) : query(base, orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as FeedbackLogEntry), id: d.id, createdAt: toMillis(d.data().createdAt) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/* ───────────────────────────── scoped data loading ───────────────────────────── */

/**
 * Runs exactly the queries the security rules can prove for this person:
 * the whole school (principal), the school filtered by subject (heads), or one
 * query per assigned grade / class (counselor, supervisor, coordinator).
 */
export async function loadScopedClasses(a: StaffAccess): Promise<ClassRecord[]> {
  const col = collection(db, "classes");
  const base = [where("schoolId", "==", a.schoolId)];
  const needsSubject = a.role === "departmentHead" || a.role === "supervisor" || a.role === "coordinator";
  const subj = needsSubject ? [where("subject", "==", a.subject || "")] : [];
  const queries = [];
  if (a.role === "principal" || a.role === "departmentHead" || a.allClasses) {
    queries.push(query(col, ...base, ...subj));
  } else {
    for (const g of a.grades || []) queries.push(query(col, ...base, ...subj, where("grade", "==", g)));
    for (const k of a.classKeys || []) queries.push(query(col, ...base, ...subj, where("classKey", "==", k)));
  }
  const snaps = await Promise.all(queries.map((q) => getDocs(q)));
  const byId = new Map<string, ClassRecord>();
  snaps.forEach((s) => s.docs.forEach((d) => byId.set(d.id, { ...(d.data() as ClassRecord), id: d.id })));
  return Array.from(byId.values()).sort(
    (x, y) => (x.grade ?? 0) - (y.grade ?? 0) || (x.section || "").localeCompare(y.section || "") || (x.subject || "").localeCompare(y.subject || "")
  );
}

export async function loadClassStudents(classId: string): Promise<StudentRecord[]> {
  const snap = await getDocs(query(collection(db, "students"), where("classId", "==", classId)));
  return snap.docs
    .map((d) => ({ ...(d.data() as StudentRecord), id: d.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadClassPoints(classId: string): Promise<PointsTransaction[]> {
  const snap = await getDocs(query(collection(db, "pointsTransactions"), where("classId", "==", classId)));
  return snap.docs.map((d) => ({ ...(d.data() as PointsTransaction), id: d.id }));
}
