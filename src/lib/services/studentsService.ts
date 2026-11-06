import { arrayUnion, deleteField, doc, getCountFromServer, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, collection, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { createFirestoreService } from "../firestoreService";
import { removeChildFromParent } from "./parentsService";
import type { StudentRecord } from "../../types";

const service = createFirestoreService<StudentRecord>("students");

/** The subject name of a class (if its teacher set one), so new students carry it for the parent portal. */
async function getClassSubject(classId: string): Promise<string | undefined> {
  try {
    const snap = await getDoc(doc(db, "classes", classId));
    return (snap.data()?.subject as string | undefined) || undefined;
  } catch {
    return undefined;
  }
}

export function subscribeToStudents(
  classId: string,
  onData: (students: StudentRecord[]) => void,
  onError?: (error: Error) => void
) {
  return service.subscribe(
    [service.where("classId", "==", classId)],
    onData,
    onError
  );
}

/** Creates a student record at join time, using the name/photo their Google account provided. */
export async function createStudent(data: {
  name: string;
  classId: string;
  parentName?: string;
  parentEmail?: string;
  photoURL?: string;
  authUid?: string;
}) {
  return service.create({
    ...data,
    points: 0,
    badgeIds: [],
  } as Omit<StudentRecord, "id" | "createdAt">);
}

export async function updateStudent(id: string, data: Partial<StudentRecord>) {
  return service.update(id, data);
}

/**
 * Detaches every parent portal account linked to a student from that
 * student, before the student's own record is deleted. Without this, a
 * deleted student's id lingers forever in a parent's `studentIds` — the
 * portal has no way to know the child is gone, so it keeps trying (and
 * failing) to load it. Best-effort per parent: one already-broken/legacy
 * link (see StudentsPage's "linked before this feature" case) shouldn't
 * block deleting the student.
 */
async function detachParents(studentId: string) {
  const snapshot = await getDoc(doc(db, "students", studentId));
  const parentUids: string[] = (snapshot.data()?.parentUids as string[]) || [];
  for (const uid of parentUids) {
    try {
      await removeChildFromParent(uid, studentId);
    } catch {
      // Ignore and continue deleting the student regardless.
    }
  }
}

export async function deleteStudent(id: string) {
  await detachParents(id);
  return service.remove(id);
}

/** Deletes many students at once (multi-select delete from the roster). */
export async function deleteManyStudents(ids: string[]) {
  await Promise.all(ids.map((id) => detachParents(id)));
  await Promise.all(ids.map((id) => service.remove(id)));
}

/**
 * Records a parent's join at the point they link to a child: denormalizes
 * their contact info onto the student (for the "send report" feature, as
 * before) and adds their auth uid to `parentUids` — the reverse-index that
 * later lets the teacher revoke just that parent's portal access for this
 * student (see `removeChildFromParent`) without the teacher's client
 * needing read access to the `parents` collection. Uses `arrayUnion` so
 * re-clicking the same invite link is a safe no-op, matching
 * `addChildToParent`'s behavior on the parent-account side.
 */
export async function recordParentJoin(
  studentId: string,
  data: { parentName: string; parentEmail: string; parentUid: string }
) {
  await updateDoc(doc(db, "students", studentId), {
    parentName: data.parentName,
    parentEmail: data.parentEmail,
    parentUids: arrayUnion(data.parentUid),
  });
}

/**
 * Saves (or, when `number` is empty, removes) the parent's WhatsApp number on
 * every student record linked to that parent, so each subject's teacher can see it.
 * Parents are allowed to change this one field on their own children (see firestore.rules).
 */
export async function setParentWhatsappForStudents(studentIds: string[], number: string | null) {
  const ids = Array.from(new Set(studentIds));
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => {
      batch.update(doc(db, "students", id), { parentWhatsapp: number ? number : deleteField() });
    });
    await batch.commit();
  }
}

/**
 * Creates a single student manually (teacher-entered, no invite/Google
 * account involved). Used by the "Add student" form.
 */
export async function createStudentManual(data: {
  classId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  parentName?: string;
  parentEmail?: string;
}) {
  return service.create({
    name: data.name,
    nameAr: data.nameAr || undefined,
    nameEn: data.nameEn || undefined,
    classId: data.classId,
    subject: await getClassSubject(data.classId),
    parentName: data.parentName || undefined,
    parentEmail: data.parentEmail || undefined,
    points: 0,
    badgeIds: [],
  } as Omit<StudentRecord, "id" | "createdAt">);
}

/**
 * Creates many students at once from a parsed bulk-upload file, using the
 * batched createMany helper so large rosters don't need one write per row.
 */
export async function createStudentsBulk(
  classId: string,
  rows: { name: string; nameAr?: string; nameEn?: string; parentName?: string; parentEmail?: string; parentWhatsapp?: string; subject?: string; teacherWhatsapp?: string }[]
) {
  const classSubject = await getClassSubject(classId);
  return service.createMany(
    rows.map(
      (row) =>
        ({
          name: row.name,
          nameAr: row.nameAr || undefined,
          nameEn: row.nameEn || undefined,
          classId,
          parentName: row.parentName || undefined,
          parentEmail: row.parentEmail || undefined,
          parentWhatsapp: row.parentWhatsapp || undefined,
          subject: row.subject || classSubject,
          teacherWhatsapp: row.teacherWhatsapp || undefined,
          points: 0,
          badgeIds: [],
        }) as Omit<StudentRecord, "id" | "createdAt">
    )
  );
}

/** Atomically awards a badge to a student, avoiding duplicate entries. */
export async function awardBadgeToStudent(studentId: string, badgeId: string) {
  await updateDoc(doc(db, "students", studentId), {
    badgeIds: arrayUnion(badgeId),
  });
}

/**
 * Writes a small `studentAccounts/{uid}` mapping doc — gives Firestore
 * security rules a cheap direct lookup ("does this uid own this studentId?")
 * for points/attendance/notes reads, without needing a collection query.
 */
export async function createStudentAccountMapping(uid: string, studentId: string, classId: string) {
  await setDoc(doc(db, "studentAccounts", uid), {
    uid,
    studentId,
    classId,
    createdAt: Date.now(),
  });
}

/** One-off (non-realtime) fetch of a single student — used when composing a parent report. */
export async function getStudentOnce(studentId: string): Promise<StudentRecord | null> {
  const snapshot = await getDoc(doc(db, "students", studentId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as StudentRecord;
}

/** Real-time listener for a single student — used by the parent portal to watch one child. */
export function subscribeToStudent(
  studentId: string,
  onData: (student: StudentRecord | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "students", studentId),
    (snapshot) => {
      onData(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as StudentRecord) : null);
    },
    (error) => onError?.(error)
  );
}

/**
 * Per-class student counts for a set of classes (Dashboard and Classes list). Uses Firestore COUNT queries — one read
 * per class (per 1,000 students) — instead of listening to every student document, which cost one read per student on
 * every load AND again every time any student changed (each mark updates the student's total). Counts are fetched once
 * when the classes are known; they refresh the next time the page opens. Same call shape as before (returns an
 * unsubscribe function), so no caller changes.
 */
export function subscribeToStudentCounts(
  classIds: string[],
  onData: (counts: Record<string, number>) => void,
  onError?: (error: Error) => void
) {
  if (classIds.length === 0) {
    onData({});
    return () => {};
  }
  let cancelled = false;
  Promise.all(
    classIds.map(async (id) => {
      const snap = await getCountFromServer(query(collection(db, "students"), where("classId", "==", id)));
      return [id, snap.data().count] as const;
    })
  )
    .then((rows) => {
      if (!cancelled) onData(Object.fromEntries(rows));
    })
    .catch((err) => {
      if (!cancelled) onError?.(err as Error);
    });
  return () => {
    cancelled = true;
  };
}

/**
 * Denormalizes the teacher's WhatsApp number onto every one of their
 * students' records (`teacherWhatsapp`), so the parent portal can show a
 * "Contact via WhatsApp" button by reading the student doc it already has
 * permission to read — no new Firestore rules needed for the parent side.
 * Called whenever the teacher updates the number in their profile.
 */
export async function setTeacherWhatsappForClasses(classIds: string[], whatsappNumber: string) {
  if (classIds.length === 0) return;
  // Firestore "in" queries cap at 30 values; chunk defensively.
  const chunks: string[][] = [];
  for (let i = 0; i < classIds.length; i += 30) {
    chunks.push(classIds.slice(i, i + 30));
  }
  for (const chunk of chunks) {
    const snapshot = await getDocs(query(collection(db, "students"), where("classId", "in", chunk)));
    if (snapshot.empty) continue;
    // Batched writes cap at 500; split into sub-chunks of 400 to stay safe.
    for (let i = 0; i < snapshot.docs.length; i += 400) {
      const batch = writeBatch(db);
      snapshot.docs.slice(i, i + 400).forEach((d) => {
        batch.update(d.ref, { teacherWhatsapp: whatsappNumber });
      });
      await batch.commit();
    }
  }
}

/**
 * Copies the teacher's school logo onto the given student records
 * (`schoolLogoURL`; with `null` it removes the copy), so the parent portal can
 * show it by reading the student doc it already may read — the same approach
 * as `teacherWhatsapp`. Records that are already up to date are skipped.
 */
export async function applySchoolLogoToStudents(
  students: Pick<StudentRecord, "id" | "schoolLogoURL">[],
  url: string | null
) {
  const stale = students.filter((s) => (s.schoolLogoURL || null) !== url);
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db);
    stale.slice(i, i + 400).forEach((s) => {
      batch.update(doc(db, "students", s.id), { schoolLogoURL: url ?? deleteField() });
    });
    await batch.commit();
  }
}

/** Copies the class's avatar collection type onto its students so the student portal can offer the right avatars. */
export async function applyAvatarGenderToStudents(
  students: Pick<StudentRecord, "id" | "avatarGender">[],
  gender: "boys" | "girls" | "mixed"
) {
  const stale = students.filter((s) => s.avatarGender !== gender);
  for (let i = 0; i < stale.length; i += 400) {
    const batch = writeBatch(db);
    stale.slice(i, i + 400).forEach((s) => batch.update(doc(db, "students", s.id), { avatarGender: gender }));
    await batch.commit();
  }
}

/** Sets several students' pictures at once (used by "random avatars for the whole class"). */
export async function assignAvatars(assignments: { id: string; photoURL: string }[]) {
  for (let i = 0; i < assignments.length; i += 400) {
    const batch = writeBatch(db);
    assignments.slice(i, i + 400).forEach((a) => batch.update(doc(db, "students", a.id), { photoURL: a.photoURL }));
    await batch.commit();
  }
}

/** Applies the teacher's school logo (or its removal) to every student in every class the teacher teaches. */
export async function syncSchoolLogoForTeacher(teacherUid: string, url: string | null) {
  const classesSnap = await getDocs(query(collection(db, "classes"), where("teacherId", "==", teacherUid)));
  const classIds = classesSnap.docs.map((d) => d.id);
  for (let i = 0; i < classIds.length; i += 30) {
    const snap = await getDocs(query(collection(db, "students"), where("classId", "in", classIds.slice(i, i + 30))));
    await applySchoolLogoToStudents(
      snap.docs.map((d) => ({ id: d.id, schoolLogoURL: (d.data() as StudentRecord).schoolLogoURL })),
      url
    );
  }
}

/** Finds the roster entry linked to a given Firebase Auth uid, if any (student portal lookup, and duplicate-join guard). */
export async function findStudentByAuthUid(
  authUid: string
): Promise<StudentRecord | null> {
  const snapshot = await getDocs(
    query(collection(db, "students"), where("authUid", "==", authUid))
  );
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as StudentRecord;
}
