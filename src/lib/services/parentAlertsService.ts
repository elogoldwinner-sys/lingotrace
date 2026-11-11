import { addDoc, arrayUnion, collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { StudentRecord } from "../../types";

/**
 * Parent alerts: one document per event (a note, marks gained / deducted, attendance, a certificate) that the
 * teacher's actions write the moment they happen. The parent portal listens to them live, so the alert and the log
 * entry appear instantly. EVERY event is kept in the log; the parent's own preferences (parents/{uid}.alertPrefs)
 * only decide which ones also pop up / make a sound / show a device notification.
 */
export type AlertType = "note" | "points" | "attendance" | "certificate";
export type AlertTone = "positive" | "negative" | "neutral";

export interface ParentAlert {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  /** Subject of the class (when the teacher is a subject teacher), so parents can tell the records apart. */
  subject?: string;
  type: AlertType;
  tone: AlertTone;
  /** points: signed amount. */
  amount?: number;
  /** points: PointsReason key (or "custom"). */
  reason?: string;
  /** points: custom reason / assessment name. note: first part of the note text. certificate: its reason. */
  text?: string;
  /** attendance: present | absent | late | excused. */
  status?: string;
  createdBy: string;
  createdAt: number;
  /** Auth uids of the parents who already opened / ticked this alert. */
  readBy?: string[];
}

/** The parent's choices for INSTANT alerts. Everything is still recorded in the log whatever these say. */
export interface AlertPrefs {
  notes: boolean;
  pointsGained: boolean;
  pointsDeducted: boolean;
  attendance: boolean;
  certificates: boolean;
  /** Play a short sound when an instant alert arrives. */
  sound: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  notes: true,
  pointsGained: true,
  pointsDeducted: true,
  attendance: true,
  certificates: true,
  sound: true,
};

/** Does the parent want an instant alert for this event? */
export function wantsInstant(prefs: AlertPrefs, a: Pick<ParentAlert, "type" | "amount">): boolean {
  switch (a.type) {
    case "note":
      return prefs.notes;
    case "points":
      return (a.amount || 0) >= 0 ? prefs.pointsGained : prefs.pointsDeducted;
    case "attendance":
      return prefs.attendance;
    case "certificate":
      return prefs.certificates;
  }
}

type NewAlert = Omit<ParentAlert, "id" | "studentName" | "classId" | "createdBy" | "createdAt" | "readBy" | "subject"> & {
  studentId: string;
  classId: string;
};

/**
 * Records an alert for a student's parents. Fire-and-forget: it never throws and never delays the teacher's own
 * action (a failure here must not undo or block a note, a mark or an attendance tick).
 */
export function sendParentAlert(alert: NewAlert): void {
  void (async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, "students", alert.studentId));
      if (!snap.exists()) return;
      const st = snap.data() as StudentRecord;
      // Nobody is linked to this student yet → nobody to alert (the log would only be noise).
      if (!st.parentUids || st.parentUids.length === 0) return;
      const clean = Object.fromEntries(Object.entries(alert).filter(([, v]) => v !== undefined && v !== ""));
      await addDoc(collection(db, "parentAlerts"), {
        ...clean,
        studentName: st.name,
        ...(st.subject ? { subject: st.subject } : {}),
        createdBy: uid,
        createdAt: Date.now(),
        readBy: [],
      });
    } catch (err) {
      console.warn("Parent alert could not be recorded", err);
    }
  })();
}

/** Live alerts of ONE child (a single equality clause, so the Firestore rule can verify it and no index is needed). */
export function subscribeToChildAlerts(
  studentId: string,
  onData: (alerts: ParentAlert[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(collection(db, "parentAlerts"), where("studentId", "==", studentId)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ParentAlert)),
    (err) => onError?.(err)
  );
}

/** The parent opens / ticks alerts: only `readBy` may change (enforced by the rules). */
export async function markAlertsRead(parentUid: string, ids: string[]) {
  await Promise.allSettled(ids.map((id) => updateDoc(doc(db, "parentAlerts", id), { readBy: arrayUnion(parentUid) })));
}

/** Live preferences stored on the parent's own document. */
export function subscribeToAlertPrefs(parentUid: string, onData: (prefs: AlertPrefs) => void) {
  return onSnapshot(
    doc(db, "parents", parentUid),
    (snap) => onData({ ...DEFAULT_ALERT_PREFS, ...((snap.data()?.alertPrefs as Partial<AlertPrefs>) || {}) }),
    () => onData(DEFAULT_ALERT_PREFS)
  );
}

export async function saveAlertPrefs(parentUid: string, prefs: AlertPrefs) {
  await updateDoc(doc(db, "parents", parentUid), { alertPrefs: prefs });
}
