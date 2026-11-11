import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Download, Printer } from "lucide-react";
import Modal from "./Modal";
import { useAuth } from "../../contexts/AuthContext";
import { useEffectiveSchoolLogo } from "../../contexts/SchoolContext";
import { buildCsv, downloadTextFile } from "../../lib/csv";
import { PrintPortal, printReport, ReportHeader, PrintedOn } from "../reports/reportParts";
import type { AttendanceRecord, AttendanceStatus, SessionRecord, StudentRecord } from "../../types";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

/**
 * Attendance report of ONE session: every student's status (present / late / absent / excused / not marked),
 * the counts and the attendance rate. Download as an Excel-ready CSV, or print / save as PDF.
 */
export default function SessionAttendanceModal({
  session,
  students,
  records,
  className,
  onClose,
}: {
  session: SessionRecord | null;
  students: StudentRecord[];
  /** The attendance records of this session (already loaded live by the Sessions page). */
  records: AttendanceRecord[];
  className: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { logo: schoolLogo } = useEffectiveSchoolLogo();

  const { rows, counts, rate } = useMemo(() => {
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    const rows = [...students]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ student: s, status: byStudent.get(s.id)?.status, note: byStudent.get(s.id)?.note || "" }));
    const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 };
    rows.forEach((r) => r.status && (counts[r.status] += 1));
    // Same definition as the attendance report: (present + late) ÷ (present + late + absent); excused isn't counted against.
    const base = counts.present + counts.late + counts.absent;
    return { rows, counts, rate: base ? Math.round(((counts.present + counts.late) / base) * 100) : null };
  }, [students, records]);

  if (!session) return null;

  const label = (s?: AttendanceStatus) => (s ? t(`attendance.${s}`) : t("sessionSummary.notMarked"));
  const title = `${t("sessionSummary.attendanceTitle")} - ${session.title}`;

  function download() {
    if (!session) return;
    const header = [t("sessionSummary.student"), t("attendanceReport.status"), t("attendanceReport.note")];
    const body = rows.map((r) => [r.student.name, label(r.status), r.note]);
    body.push([]);
    STATUSES.forEach((s) => body.push([label(s), String(counts[s]), ""]));
    body.push([t("attendanceReport.rate"), rate === null ? "" : `${rate}%`, ""]);
    downloadTextFile(`attendance - ${className} - ${session.title} - ${session.date}.csv`.replace(/[\\/:*?"<>|]/g, "-"), buildCsv(header, body));
  }

  const sheet = (
    <div className="lt-report">
      <ReportHeader
        title={t("sessionSummary.attendanceTitle")}
        logo={schoolLogo}
        lines={[
          { label: t("attendanceReport.class"), value: className },
          { label: t("sessionSummary.session"), value: session.title },
          { label: t("sessionSummary.date"), value: session.date },
          { label: t("reports.teacher"), value: profile?.displayName || "" },
        ]}
      />
      <table className="lt-table" style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            {STATUSES.map((s) => (
              <th key={s} className="num">
                {label(s)}
              </th>
            ))}
            <th className="num">{t("attendanceReport.rate")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {STATUSES.map((s) => (
              <td key={s} className="num">
                <b>{counts[s]}</b>
              </td>
            ))}
            <td className="num">
              <b>{rate === null ? "—" : `${rate}%`}</b>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="lt-table">
        <thead>
          <tr>
            <th>{t("sessionSummary.student")}</th>
            <th>{t("attendanceReport.status")}</th>
            <th>{t("attendanceReport.note")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.student.id}>
              <td>
                <b>{r.student.name}</b>
              </td>
              <td className={r.status === "present" ? "lt-pos" : r.status === "absent" ? "lt-neg" : undefined}>{label(r.status)}</td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lt-foot">{t("attendanceReport.rateNote")}</p>
      <PrintedOn />
    </div>
  );

  return (
    <>
      <Modal open onClose={onClose} title={title} widthClassName="max-w-3xl">
        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={download} disabled={records.length === 0} className="btn-secondary py-2 px-4 text-sm disabled:opacity-50">
              <Download size={16} />
              {t("sessionSummary.download")}
            </button>
            <button type="button" onClick={() => printReport(title)} className="btn-primary py-2 px-4 text-sm">
              <Printer size={16} />
              {t("reports.print")}
            </button>
          </div>
          {records.length === 0 && <p className="text-sm text-cream-600">{t("sessionSummary.attendanceEmpty")}</p>}
          {sheet}
        </div>
      </Modal>
      <PrintPortal>{sheet}</PrintPortal>
    </>
  );
}
