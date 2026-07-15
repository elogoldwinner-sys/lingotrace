export type UserRole = "teacher" | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
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
  name: string;
  classId: string;
  parentName?: string;
  parentEmail?: string;
  photoURL?: string;
  points: number;
  badgeIds: string[];
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

export interface NoteRecord {
  id: string;
  studentId: string;
  classId: string;
  authorId: string;
  content: string;
  visibleToParent: boolean;
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
