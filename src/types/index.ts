export type UserRole = "teacher" | "admin" | "student" | "parent";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  createdAt: number;
}

/** A parent's portal account — links a Firebase Auth uid to one child in one class. */
export interface ParentProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "parent";
  classId: string;
  studentId: string;
  createdAt: number;
}

/**
 * A shareable join link for a class. `id` is the random token used in the
 * `/join/:token` URL. Anyone with the link can read this document (by exact
 * id only — the collection is never listable) to discover which class/role
 * it grants before they've signed in.
 */
export interface InviteRecord {
  id: string;
  classId: string;
  className: string;
  role: "student" | "parent";
  createdBy: string;
  createdAt: number;
}

export interface ClassRecord {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  color?: string;
  studentIds: string[];
  createdAt: number;
}

export interface StudentRecord {
  id: string;
  /** Comes directly from the student's Google account displayName at join time. */
  name: string;
  classId: string;
  parentName?: string;
  parentEmail?: string;
  /** Comes from Google at join time; the student can replace it with their own upload afterward. */
  photoURL?: string;
  points: number;
  badgeIds: string[];
  /** Firebase Auth uid of the student's own portal account, once claimed via an invite link. */
  authUid?: string;
  createdAt: number;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceRecord {
  id: string;
  classId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  note?: string;
  /** Set when attendance was taken from within a specific session (a day can have more than one). */
  sessionId?: string;
  /** Points already granted to the student for this record's current status, so re-marking (e.g. present → absent) adjusts the student's total instead of double-counting. */
  pointsAwarded?: number;
  recordedAt: number;
}

export interface SessionRecord {
  id: string;
  classId: string;
  title: string;
  date: string; // YYYY-MM-DD
  topic?: string;
  objectives?: string;
  createdAt: number;
}

export type NoteSentiment = "positive" | "negative";

export interface NoteRecord {
  id: string;
  studentId: string;
  classId: string;
  authorId: string;
  content: string;
  sentiment: NoteSentiment;
  visibleToParent: boolean;
  /** Set when the note was added from inside a specific session's roster. */
  sessionId?: string;
  createdAt: number;
}

export type PointsReason =
  | "participation"
  | "homework"
  | "behavior"
  | "attendance"
  | "assignment"
  | "manual"
  | "other";

export interface PointsTransaction {
  id: string;
  studentId: string;
  classId: string;
  amount: number; // can be negative
  reason: PointsReason;
  note?: string;
  awardedBy: string;
  createdAt: number;
}

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji or icon key
  criteria: {
    type: "points_threshold" | "attendance_streak" | "manual";
    value?: number;
  };
}

export interface StudentBadge {
  id: string;
  studentId: string;
  badgeId: string;
  awardedAt: number;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  type: "badge" | "points" | "note" | "attendance" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  linkTo?: string;
}
