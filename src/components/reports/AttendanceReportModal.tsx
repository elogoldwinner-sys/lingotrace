import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Download } from "lucide-react";
import { format as formatDate, parseISO, startOfWeek } from "date-fns";
import Modal from "../common/Modal";
import { useAuth } from "../../contexts/AuthContext";
import { useEffectiveSchoolLogo } from "../../contexts/SchoolContext";
import { buildCsv, downloadTextFile } from "../../lib/csv";
import { PrintPortal, printReport, ReportHeader, PrintedOn } from "./reportParts";
import type { AttendanceRecord, AttendanceStatus, StudentRecord } from "../../types";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];
const COLORS: Record<AttendanceStatus, string> = {
  present: "#15803d",
  late: "#d97706",
  absent: "#dc2626",
  excused: "#64748b",
};
const ALL = "__class__";

type Counts = Record<AttendanceStatus, number>;
const zero = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0 });
const total = (c: Counts) => c.present + c.late + c.absent + c.excused;
/** Attendance rate: (present + late) out of every session except excused ones. null when there is nothing to measure. */
function rate(c: Counts): number | null {
  const denom = c.present + c.late + c.absent;
  return denom === 0 ? null : Math.round(((c.present + c.late) / denom) * 100);
}

/** Line chart of the attendance rate (%) per school week. Pure SVG so it prints cleanly. */
function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 560;
  const H = 170;
  const pad = { l: 34, r: 12, t: 12, b: 28 };
  if (points.length === 0) return null;
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100;
  const step = Math.ceil(points.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 640, height: "auto" }} role="img">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="#e5e7eb" />
          <text x={pad.l - 6} y={y(g) + 4} fontSize="10" textAnchor="end" fill="#6b7280">
            {g}%
          </text>
        </g>
      ))}
      <polyline fill="none" stroke="#15803d" strokeWidth="2.5" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill="#15803d" />
          <text x={x(i)} y={y(p.value) - 8} fontSize="10" textAnchor="middle" fill="#14532d">
            {p.value}%
          </text>
          {i % step === 0 && (
            <text x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#6b7280">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** One stacked bar showing present / late / absent / excused proportions. */
function StackedBar({ counts }: { counts: Counts }) {
  const sum = total(counts);
  if (sum === 0) return <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <div style={{ display: "flex", height: 12, minWidth: 120, borderRadius: 6, overflow: "hidden", background: "#e5e7eb" }}>
      {STATUSES.map((s) =>
        counts[s] > 0 ? <div key={s} title={`${s}: ${counts[s]}`} style={{ width: `${(counts[s] / sum) * 100}%`, background: COLORS[s] }} /> : null
      )}
    </div>
  );
}

/**
 * Attendance report for a whole class or one student over a date range: counts, attendance rate,
 * a per-week trend and a per-student (class) or per-date (student) table. Printable (save as PDF
 * from the print dialog) and downloadable as a CSV that opens in Excel.
 */
export default function AttendanceReportModal({
  open,
  onClose,
  className,
  students,
  records,
  startDate: initialStart,
  endDate: initialEnd,
  initialStudentId,
}: {
  open: boolean;
  onClose: () => void;
  className: string;
  students: StudentRecord[];
  records: AttendanceRecord[];
  startDate: string;
  endDate: string;
  initialStudentId?: string;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { logo: schoolLogo } = useEffectiveSchoolLogo();
  const [scope, setScope] = useState(initialStudentId || ALL);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [wholePeriod, setWholePeriod] = useState(false);

  const student = students.find((s) => s.id === scope);
  const nameOf = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  const inScope = useMemo(
    () =>
      records.filter(
        (r) =>
          (wholePeriod || (r.date >= start && r.date <= end)) &&
          (scope === ALL ? nameOf.has(r.studentId) : r.studentId === scope)
      ),
    [records, start, end, wholePeriod, scope, nameOf]
  );

  const totals = useMemo(() => {
    const c = zero();
    inScope.forEach((r) => (c[r.status] += 1));
    return c;
  }, [inScope]);

  const perStudent = useMemo(() => {
    const m = new Map<string, Counts>();
    students.forEach((s) => m.set(s.id, zero()));
    inScope.forEach((r) => {
      const c = m.get(r.studentId);
      if (c) c[r.status] += 1;
    });
    return students
      .map((s) => ({ student: s, counts: m.get(s.id)! }))
      .sort((a, b) => (rate(a.counts) ?? 101) - (rate(b.counts) ?? 101) || a.student.name.localeCompare(b.student.name));
  }, [inScope, students]);

  const byDate = useMemo(() => [...inScope].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), [inScope]);

  const trend = useMemo(() => {
    const weeks = new Map<string, Counts>();
    inScope.forEach((r) => {
      const key = formatDate(startOfWeek(parseISO(r.date), { weekStartsOn: 0 }), "yyyy-MM-dd");
      const c = weeks.get(key) || zero();
      c[r.status] += 1;
      weeks.set(key, c);
    });
    return Array.from(weeks.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, c]) => ({ label: formatDate(parseISO(key), "d/M"), value: rate(c) }))
      .filter((p): p is { label: string; value: number } => p.value !== null);
  }, [inScope]);

  const overall = rate(totals);
  const label = (s: AttendanceStatus) => t(`attendance.${s}`);
  const periodText = wholePeriod ? t("attendanceReport.wholePeriod") : `${start} → ${end}`;
  const subject = student ? student.name : t("attendanceReport.wholeClass");

  function downloadCsv() {
    const header = student
      ? [t("attendanceReport.date"), t("attendanceReport.status"), t("attendanceReport.note")]
      : [t("students.title"), label("present"), label("late"), label("absent"), label("excused"), t("attendanceReport.rate")];
    const rows = student
      ? byDate.map((r) => [r.date, label(r.status), r.note || ""])
      : perStudent.map(({ student: s, counts }) => [
          s.name,
          String(counts.present),
          String(counts.late),
          String(counts.absent),
          String(counts.excused),
          rate(counts) === null ? "" : `${rate(counts)}%`,
        ]);
    downloadTextFile(`attendance - ${className} - ${subject}.csv`, buildCsv(header, rows));
  }

  const sheet = (
    <div className="lt-report">
      <ReportHeader
        title={t("attendanceReport.title")}
        logo={schoolLogo}
        lines={[
          { label: t("attendanceReport.class"), value: className },
          { label: t("attendanceReport.subject"), value: subject },
          { label: t("attendanceReport.period"), value: periodText },
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
              <td key={s} className="num" style={{ color: COLORS[s], fontWeight: 700 }}>
                {totals[s]}
              </td>
            ))}
            <td className="num">
              <b>{overall === null ? "—" : `${overall}%`}</b>
            </td>
          </tr>
        </tbody>
      </table>

      {trend.length > 0 && (
        <>
          <h3 style={{ margin: "10px 0 4px", fontSize: 13 }}>{t("attendanceReport.trend")}</h3>
          <TrendChart points={trend} />
        </>
      )}

      {total(totals) === 0 ? (
        <p>{t("attendanceReport.empty")}</p>
      ) : student ? (
        <table className="lt-table">
          <thead>
            <tr>
              <th>{t("attendanceReport.date")}</th>
              <th>{t("attendanceReport.status")}</th>
              <th>{t("attendanceReport.note")}</th>
            </tr>
          </thead>
          <tbody>
            {byDate.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td style={{ color: COLORS[r.status], fontWeight: 700 }}>{label(r.status)}</td>
                <td>{r.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="lt-table">
          <thead>
            <tr>
              <th>{t("students.title")}</th>
              {STATUSES.map((s) => (
                <th key={s} className="num">
                  {label(s)}
                </th>
              ))}
              <th className="num">{t("attendanceReport.rate")}</th>
              <th>{t("attendanceReport.distribution")}</th>
            </tr>
          </thead>
          <tbody>
            {perStudent.map(({ student: s, counts }) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                </td>
                {STATUSES.map((st) => (
                  <td key={st} className="num">
                    {counts[st]}
                  </td>
                ))}
                <td className="num">
                  <b>{rate(counts) === null ? "—" : `${rate(counts)}%`}</b>
                </td>
                <td>
                  <StackedBar counts={counts} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="lt-foot">{t("attendanceReport.rateNote")}</p>
      <PrintedOn />
    </div>
  );

  if (!open) return null;
  return (
    <>
      <Modal open onClose={onClose} title={t("attendanceReport.title")} widthClassName="max-w-4xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label-eyebrow mb-1 block text-[10px]">{t("attendanceReport.subject")}</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="input-field w-auto">
                <option value={ALL}>{t("attendanceReport.wholeClass")}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-eyebrow mb-1 block text-[10px]">{t("sessions.startDate")}</label>
              <input type="date" value={start} disabled={wholePeriod} onChange={(e) => setStart(e.target.value)} className="input-field w-auto disabled:opacity-50" />
            </div>
            <div>
              <label className="label-eyebrow mb-1 block text-[10px]">{t("sessions.endDate")}</label>
              <input type="date" value={end} disabled={wholePeriod} onChange={(e) => setEnd(e.target.value)} className="input-field w-auto disabled:opacity-50" />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-navy">
              <input type="checkbox" checked={wholePeriod} onChange={(e) => setWholePeriod(e.target.checked)} />
              {t("attendanceReport.wholePeriod")}
            </label>
            <div className="ms-auto flex gap-2">
              <button type="button" onClick={downloadCsv} disabled={total(totals) === 0} className="btn-secondary py-2 px-3 text-sm disabled:opacity-50">
                <Download size={16} />
                {t("attendanceReport.downloadCsv")}
              </button>
              <button
                type="button"
                onClick={() => printReport(`${t("attendanceReport.title")} - ${className} - ${subject}`)}
                className="btn-primary py-2 px-3 text-sm"
              >
                <Printer size={16} />
                {t("reports.print")}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">{sheet}</div>
        </div>
      </Modal>
      <PrintPortal>{sheet}</PrintPortal>
    </>
  );
}
