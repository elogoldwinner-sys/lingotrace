import { collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where, writeBatch, deleteField } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import { createStudentsBulk } from "./studentsService";
import type { ClassRecord, StudentRecord } from "../../types";

const service = createFirestoreService<ClassRecord>("classes");

export function subscribeToClasses(
  teacherId: string,
  onData: (classes: ClassRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("teacherId", "==", teacherId)],
    onData,
    onError
  );
}

/**
 * Like subscribeToClasses, but also includes the subject classes this teacher
 * handed to co-teachers (including ones still waiting for the co-teacher's
 * first sign-in) — used by the Classes page to show who teaches what.
 */
export function subscribeToClassesAndSubjects(
  uid: string,
  onData: (classes: ClassRecord[]) => void,
  onError?: (error: Error) => void
) {
  let mine: ClassRecord[] = [];
  let given: ClassRecord[] = [];
  const emit = () => {
    const byId = new Map<string, ClassRecord>();
    [...mine, ...given].forEach((c) => byId.set(c.id, c));
    onData(Array.from(byId.values()));
  };
  const unsubMine = service.subscribe(
    [service.where("teacherId", "==", uid)],
    (d) => {
      mine = d;
      emit();
    },
    onError
  );
  const unsubGiven = service.subscribe(
    [service.where("ownerId", "==", uid)],
    (d) => {
      given = d;
      emit();
    },
    onError
  );
  return () => {
    unsubMine();
    unsubGiven();
  };
}

export async function createClass(data: {
  name: string;
  description?: string;
  teacherId: string;
  color?: string;
  subject?: string;
  avatarGender?: "boys" | "girls" | "mixed";
}) {
  return service.create({ ...data, studentIds: [] } as Omit<ClassRecord, "id" | "createdAt">);
}

export async function updateClass(id: string, data: Partial<ClassRecord>) {
  return service.update(id, data);
}

/** Sets (or clears) the subject name of a class and stamps it on the class's students, so parents see it in their portal. */
export async function setClassSubject(classId: string, subject: string) {
  const value = subject.trim();
  await updateDoc(doc(db, "classes", classId), { subject: value || deleteField() });
  const snap = await getDocs(query(collection(db, "students"), where("classId", "==", classId)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { subject: value || deleteField() }));
    await batch.commit();
  }
}

export async function deleteClass(id: string) {
  return service.remove(id);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * The classroom teacher adds a subject teacher by Gmail. This only creates the
 * subject class (unclaimed, `teacherId: ""`); the co-teacher's student records
 * are copied the first time they sign in — see claimPendingSubjects.
 */
export async function addSubjectTeacher(data: {
  mainClass: ClassRecord;
  subject: string;
  teacherEmail: string;
  ownerId: string;
  ownerName: string;
}) {
  const subject = data.subject.trim();
  return service.create({
    name: `${data.mainClass.name} – ${subject}`,
    description: data.mainClass.description || undefined,
    teacherId: "",
    studentIds: [],
    subject,
    parentClassId: data.mainClass.id,
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    teacherEmail: normalizeEmail(data.teacherEmail),
    // A subject starts with the same avatar collection as its main class.
    ...(data.mainClass.avatarGender ? { avatarGender: data.mainClass.avatarGender } : {}),
  } as Omit<ClassRecord, "id" | "createdAt">);
}

/** Copies the main class's students into a subject class as brand-new records (zero points, no portal links). Skips names the subject class already has. */
async function copyStudentsIntoSubject(parentClassId: string, subjectClassId: string, subject: string, teacherUid: string) {
  // The subject teacher's WhatsApp number (from their own profile) so parents get the contact button.
  const teacherSnap = await getDoc(doc(db, "teachers", teacherUid));
  const teacherWhatsapp = (teacherSnap.data()?.whatsappNumber as string | undefined) || undefined;

  const [mainSnap, subjectSnap] = await Promise.all([
    getDocs(query(collection(db, "students"), where("classId", "==", parentClassId))),
    getDocs(query(collection(db, "students"), where("classId", "==", subjectClassId))),
  ]);
  const existing = new Set(
    subjectSnap.docs.map((d) => String((d.data() as StudentRecord).name).trim().toLowerCase())
  );
  // Backfill the subject label (and WhatsApp) on subject students copied before these existed.
  const stale = subjectSnap.docs.filter((d) => {
    const s = d.data() as StudentRecord;
    return s.subject !== subject || (teacherWhatsapp && !s.teacherWhatsapp);
  });
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db);
    stale.slice(i, i + 400).forEach((d) =>
      batch.update(d.ref, { subject, ...(teacherWhatsapp ? { teacherWhatsapp } : {}) })
    );
    await batch.commit();
  }
  const rows = mainSnap.docs
    .map((d) => d.data() as StudentRecord)
    .filter((s) => !existing.has(String(s.name).trim().toLowerCase()))
    .map((s) => ({ name: s.name, parentName: s.parentName, parentEmail: s.parentEmail }));
  if (rows.length > 0) await createStudentsBulk(subjectClassId, rows.map((r) => ({ ...r, subject, teacherWhatsapp })));
  return rows.length;
}

/** Re-syncs a subject class with its main class (adds students who joined the main class later). Returns how many were added. */
export async function syncSubjectStudents(subjectClass: ClassRecord) {
  if (!subjectClass.parentClassId || !subjectClass.teacherId) return 0;
  return copyStudentsIntoSubject(
    subjectClass.parentClassId,
    subjectClass.id,
    subjectClass.subject || "",
    subjectClass.teacherId
  );
}

/**
 * Called when a teacher signs in: any subject classes waiting for this Gmail
 * are claimed (teacherId set to this uid) and filled with a copy of the main
 * class's students. The Firestore rules only let the update change `teacherId`
 * on an unclaimed class whose `teacherEmail` matches the signed-in account, and
 * only once — so a second tab that loses the race fails here and doesn't copy
 * the students twice.
 */
export async function claimPendingSubjects(uid: string, email: string | null) {
  if (!email) return;
  const pending = await getDocs(
    query(
      collection(db, "classes"),
      where("teacherEmail", "==", normalizeEmail(email)),
      where("teacherId", "==", "")
    )
  );
  for (const d of pending.docs) {
    // A transaction, so two simultaneous claims (e.g. two tabs) can't both win and copy the students twice.
    let claimed = false;
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "classes", d.id);
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().teacherId) return;
        tx.update(ref, { teacherId: uid });
        claimed = true;
      });
    } catch {
      continue;
    }
    if (!claimed) continue;
    const parentClassId = (d.data() as ClassRecord).parentClassId;
    if (parentClassId) {
      try {
        await copyStudentsIntoSubject(parentClassId, d.id, (d.data() as ClassRecord).subject || "", uid);
      } catch (err) {
        console.error("Couldn't copy students into subject class", err);
      }
    }
  }
}
