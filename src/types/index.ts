export type UserRole = "teacher" | "admin" | "student" | "parent";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  /** Teacher's WhatsApp contact number (with country code), shown to parents in the parent portal. */
  whatsappNumber?: string;
  /**
   * The exact moment the weekly class-champions board reveals/updates,
   * teacher-configurable — periods repeat every 7 days from this anchor.
   * Defaults to Thursday at 00:00 when unset (see classRankingsService).
   */
  rankingAnchor?: number;
  /** @deprecated superseded by `rankingAnchor` — kept only so a teacher's schedule set under the old day/time picker still converts over. */
  rankingDay?: number;
  /** @deprecated superseded by `rankingAnchor`. */
  rankingTime?: string;
  createdAt: number;
}

/**
 * A parent's portal account — links a Firebase Auth uid to one or more
 * children. `studentIds` supports a parent with multiple children across
 * one or more classes; joining another child's invite link with the same
 * Google account adds to this list instead of replacing it.
 */
export interface ParentProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "parent";
  studentIds: string[];
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
  /**
   * Auth uid(s) of parent portal account(s) linked to this student, recorded
   * at join time (see `recordParentJoin`) so the teacher can later revoke a
   * specific parent's portal access (see `removeChildFromParent`) without
   * needing read access to the `parents` collection itself — the teacher
   * already has full read/write on their own students. Links formed before
   * this field existed won't have an entry here, so they can't be revoked
   * this way.
   */
  parentUids?: string[];
  /** Comes from Google at join time; the student can replace it with their own upload afterward. */
  photoURL?: string;
  points: number;
  badgeIds: string[];
  /** Denormalized copy of the teacher's WhatsApp number, kept in sync whenever the teacher updates it, so the parent portal can show a "Contact via WhatsApp" button without extra permissions. */
  teacherWhatsapp?: string;
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

/** A project assignment the teacher creates for a class, with a submission deadline. */
export interface ProjectRecord {
  id: string;
  classId: string;
  teacherId: string;
  title: string;
  description?: string;
  deadline: string; // YYYY-MM-DD, end of day in the deadline's own date
  createdAt: number;
}

/**
 * A single student's submission for a project. `id` is always
 * `${projectId}_${studentId}` (see submissionsService), so a student
 * submitting twice updates the same doc instead of creating duplicates.
 * `awardedMark` is unset until the teacher grades it; once set, the
 * submission is locked from further student edits.
 */
export interface SubmissionRecord {
  id: string;
  projectId: string;
  classId: string;
  studentId: string;
  link: string;
  note?: string;
  submittedAt: number;
  awardedMark?: number;
  /** Teacher's feedback on the graded submission — shown to the student on their submission page, and to both the student and parent via the resulting points-transaction note. */
  teacherNote?: string;
  gradedAt?: number;
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
  | "project"
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

/**
 * A single, school-wide announcement — one post at a time (posting a new one
 * replaces the last), visible to every signed-in user (teacher, student, or
 * parent) regardless of which class/teacher they're linked to. Stored as a
 * singleton document at announcements/current. Only a signed-in teacher can
 * create/edit/clear it (see firestore.rules).
 */
export interface Announcement {
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  postedByName: string;
  updatedAt: number;
}

/** One student's placement in a weekly class ranking. */
export interface RankingEntry {
  studentId: string;
  name: string;
  /** The student's current points total (same number shown on their card) at the time this board was computed. */
  points: number;
}

/**
 * One podium spot (1st, 2nd, or 3rd place) in a class's weekly board.
 * `entries` holds more than one student whenever they're tied on points —
 * a tie always shares the same spot rather than spilling into the next
 * one, so a class can show e.g. two students at 2nd place and nobody at
 * 3rd for that week.
 */
export interface RankingPosition {
  rank: 1 | 2 | 3;
  /** Points earned within the ranking period only (not the student's all-time total) — shared by every tied entry at this spot. */
  points: number;
  entries: RankingEntry[];
}

/**
 * The current top-3 board for a class, for one weekly period. Doc id =
 * classId (one "current" ranking per class, overwritten each week — not a
 * history log). `weekId` is the YYYY-MM-DD of the reveal moment the period
 * ends on, so the portal/dashboard can tell "is this still this week's
 * board, or stale and due for recompute" at a glance. Computed client-side
 * by the teacher (see classRankingsService) since this app has no backend
 * to run a schedule — recomputed lazily the next time the teacher opens
 * the dashboard or students tab on or after a reveal moment.
 *
 * `className` is denormalized at compute time (only the owning teacher's
 * client can read the `classes` collection) so the parent portal's
 * school-wide view can label each class's board without needing extra
 * read access.
 */
export interface ClassRanking {
  classId: string;
  className: string;
  weekId: string; // YYYY-MM-DD of the period's ending reveal moment
  periodStart: number;
  periodEnd: number;
  /** Up to 3 podium spots, highest points first. Empty when nobody earned points this period. */
  positions: RankingPosition[];
  computedAt: number;
}
