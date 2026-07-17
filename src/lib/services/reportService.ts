import { getStudentOnce } from "./studentsService";
import { getPointsForStudentInRange } from "./pointsService";
import { getAttendanceForStudentInRange } from "./attendanceService";
import { getNotesForStudentInRange } from "./notesService";
import { getBadgeDefinition } from "./badgesService";
import { sendParentReport } from "../emailjs";
import type { AttendanceStatus } from "../../types";

export interface SendPeriodReportInput {
  studentId: string;
  className: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Builds and sends a one-click "how has my child done this period" email to
 * the student's parent, covering points earned, attendance breakdown, notes
 * (positive/negative), and badges — all scoped to the given date range.
 */
export async function sendPeriodReportToParent(input: SendPeriodReportInput) {
  const student = await getStudentOnce(input.studentId);
  if (!student) throw new Error("Student not found.");
  if (!student.parentEmail) {
    throw new Error("This student has no parent email on file yet.");
  }

  const startMs = new Date(`${input.startDate}T00:00:00`).getTime();
  const endMs = new Date(`${input.endDate}T23:59:59`).getTime();

  const [points, attendance, notes] = await Promise.all([
    getPointsForStudentInRange(input.studentId, startMs, endMs),
    getAttendanceForStudentInRange(input.studentId, input.startDate, input.endDate),
    getNotesForStudentInRange(input.studentId, startMs, endMs),
  ]);

  const pointsEarned = points.reduce((sum, txn) => sum + txn.amount, 0);

  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
  };
  attendance.forEach((r) => {
    counts[r.status] += 1;
  });
  const attendanceSummary = `Present: ${counts.present}, Late: ${counts.late}, Absent: ${counts.absent}, Excused: ${counts.excused}`;

  const notesSummary =
    notes.length === 0
      ? "No notes for this period."
      : notes
          .map((n) => `${n.sentiment === "positive" ? "+" : "-"} ${n.content}`)
          .join("\n");

  const badgesSummary =
    student.badgeIds.length === 0
      ? "No badges yet."
      : student.badgeIds
          .map((id) => getBadgeDefinition(id)?.name)
          .filter(Boolean)
          .join(", ");

  await sendParentReport({
    to_email: student.parentEmail,
    parent_name: student.parentName || "there",
    student_name: student.name,
    class_name: input.className,
    points: pointsEarned,
    attendance_summary: attendanceSummary,
    notes: notesSummary,
    badges: badgesSummary,
    message: `Progress report for ${input.startDate} to ${input.endDate}.`,
  });
}
