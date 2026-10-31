import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { format, subDays } from "date-fns";
import Spinner from "../../components/common/Spinner";
import { useSchool } from "../../contexts/SchoolContext";
import { useAuth } from "../../contexts/AuthContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { SchoolPrintedOn, SchoolSignBlock } from "../../components/school/SchoolReportParts";
import { PrintPortal, printReport, ReportControls, ReportHeader, StatCards } from "../../components/reports/reportParts";
import { GAINED, GainedLostBars, HorizontalBars, Legend, LOST, RunningTotalLine } from "../../components/charts/PointsCharts";
import {
  bucketize,
  byReason,
  describePeriod,
  filterTxns,
  isPeriodValid,
  totalsOf,
  type KindFilter,
  type Period,
  type Txn,
} from "../../lib/reports/pointsStats";
import type { ClassRecord, StudentRecord } from "../../types";

function classOptionLabel(c: ClassRecord, teacher: string) {
  return `${c.classKey || c.name} · ${c.subject || "—"} · ${teacher}`;
}

const sign = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/** Printable reports: a whole class, or one student, for the entire period or between two dates. */
export default function SchoolReportsPage() {
  const { t } = useTranslation();
  const { school, staff } = useSchool();
  const { user, profile } = useAuth();
  const { classes, loading, teacherName, getStudents, getTxns, audit } = useSchoolData();
  const [params] = useSearchParams();
  const [classId, setClassId] = useState(params.get("class") || "");
  const [studentId, setStudentId] = useState(params.get("student") || "");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [all, setAll] = useState<Txn[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [includeEntries, setIncludeEntries] = useState(true);
  const [period, setPeriod] = useState<Period>({
    mode: "all",
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [kind, setKind] = useState<KindFilter>("both");
  const opened = useRef("");

  const cls = classes.find((c) => c.id === classId) || null;
  const student = students.find((s) => s.id === studentId) || null;

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id);
  }, [classes, classId]);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    Promise.all([getStudents(classId), getTxns(classId)])
      .then(([s, x]) => {
        if (cancelled) return;
        setStudents(s);
        setAll(x);
        setStudentId((prev) => (s.some((st) => st.id === prev) ? prev : ""));
      })
      .catch((err) => {
        console.error("Report load failed", err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const valid = isPeriodValid(period);
  const firstAt = all.length ? Math.min(...all.map((x) => x.at)) : null;
  const scoped = useMemo(() => (studentId ? all.filter((x) => x.studentId === studentId) : all), [all, studentId]);
  const txns = useMemo(() => (valid ? filterTxns(scoped, period, kind) : []), [scoped, period, kind, valid]);
  const totals = totalsOf(txns);

  // Audit trail: record once each time someone opens a class / student report.
  useEffect(() => {
    if (!cls || busy || failed) return;
    const key = `${classId}:${studentId}`;
    if (opened.current === key) return;
    opened.current = key;
    audit("report_opened", target());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls, studentId, busy, failed]);

  function target() {
    if (!cls) return "";
    const base = `${t("reports.class")} ${cls.classKey || cls.name} · ${cls.subject || "—"}`;
    return student ? `${t("reports.student")}: ${student.name} (${base})` : base;
  }

  const periodLabel = period.mode === "all" ? `${t("reports.periodAllShort")} (${describePeriod(period, firstAt)})` : describePeriod(period, firstAt);
  const kindLabel = kind === "gained" ? t("reports.kindGained") : kind === "lost" ? t("reports.kindLost") : t("reports.kindBoth");
  const series = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];

  const perStudent = useMemo(
    () =>
      students
        .map((s) => ({ s, tt: totalsOf(txns.filter((x) => x.studentId === s.id)) }))
        .sort((a, b) => b.tt.net - a.tt.net || a.s.name.localeCompare(b.s.name)),
    [students, txns]
  );
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || "";
  const { size, buckets } = useMemo(() => bucketize(txns, period), [txns, period]);
  const reasons = useMemo(() => byReason(txns), [txns]);

  const printTitle = `${student ? student.name : cls?.classKey || cls?.name || ""} - ${t(student ? "reports.studentReportTitle" : "reports.classReportTitle")}`;

  const sheet =
    !cls ? null : (
      <div className="lt-report">
        <ReportHeader
          title={student ? t("reports.studentReportTitle") : t("reports.classReportTitle")}
          logo={school?.logoURL}
          lines={[
            { label: t("sp.school", "School"), value: school?.name || "" },
            { label: t("reports.class"), value: `${cls.classKey || cls.name}` },
            { label: t("sp.subject", "Subject"), value: cls.subject || "—" },
            { label: t("reports.teacher"), value: teacherName(cls) },
            ...(student ? [{ label: t("reports.student"), value: student.name }] : []),
            { label: t("reports.period"), value: periodLabel },
            { label: t("reports.show"), value: kindLabel },
          ]}
        />
        <StatCards totals={totals} />
        {txns.length === 0 ? (
          <p style={{ marginTop: 16, color: "#6b7280" }}>{t("reports.noData")}</p>
        ) : (
          <>
            {student ? (
              <>
                <div className="lt-avoid">
                  <h2>
                    {t("reports.gainedLostPer")} ({t(`reports.bucket.${size}`)})
                  </h2>
                  <GainedLostBars buckets={buckets} />
                  <Legend items={series} />
                </div>
                <div className="lt-avoid">
                  <h2>{t("reports.runningTotal")}</h2>
                  <RunningTotalLine buckets={buckets} />
                </div>
                <div className="lt-avoid">
                  <h2>{t("reports.byReason")}</h2>
                  <HorizontalBars rows={reasons.map((r) => ({ label: t(`points.reasons.${r.reason}`), values: [r.gained, r.lost] }))} series={series} />
                  <Legend items={series} />
                </div>
              </>
            ) : (
              <>
                <div className="lt-avoid">
                  <h2>{t("reports.studentsCompared")}</h2>
                  <HorizontalBars rows={perStudent.map((p) => ({ label: p.s.name, values: [p.tt.gained, p.tt.lost] }))} series={series} />
                  <Legend items={series} />
                </div>
                <h2>{t("sp.perStudent", "Per student")}</h2>
                <table className="lt-table">
                  <thead>
                    <tr>
                      <th>{t("reports.student")}</th>
                      <th className="num">{t("reports.gained")}</th>
                      <th className="num">{t("reports.lost")}</th>
                      <th className="num">{t("reports.net")}</th>
                      <th className="num">{t("reports.records")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perStudent.map((p) => (
                      <tr key={p.s.id}>
                        <td>{p.s.name}</td>
                        <td className="num lt-pos">+{p.tt.gained}</td>
                        <td className="num lt-neg">−{p.tt.lost}</td>
                        <td className={`num ${p.tt.net >= 0 ? "lt-pos" : "lt-neg"}`}>{sign(p.tt.net)}</td>
                        <td className="num">{p.tt.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {(student || includeEntries) && (
              <>
                <h2>{t("reports.history")}</h2>
                <table className="lt-table">
                  <thead>
                    <tr>
                      <th>{t("reports.colDate")}</th>
                      {!student && <th>{t("reports.student")}</th>}
                      <th>{t("reports.colReason")}</th>
                      <th>{t("reports.colDetail")}</th>
                      <th className="num">{t("reports.colPoints")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...txns].reverse().map((x) => (
                      <tr key={x.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{x.at ? format(new Date(x.at), "yyyy-MM-dd HH:mm") : ""}</td>
                        {!student && <td>{nameOf(x.studentId)}</td>}
                        <td>{t(`points.reasons.${x.reason}`)}</td>
                        <td>{x.note}</td>
                        <td className={`num ${x.amount >= 0 ? "lt-pos" : "lt-neg"}`}>{sign(x.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
        <SchoolSignBlock />
        <SchoolPrintedOn by={profile?.displayName || user?.displayName || user?.email || ""} />
      </div>
    );

  if (loading) return <Spinner />;
  if (classes.length === 0) return <p className="text-sm text-cream-600">{t("sp.noClasses", "No classes to show yet.")}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.reportsTitle", "Reports")}</h1>
      <div className="card space-y-4 p-4">
        <ReportControls
          period={period}
          onPeriod={setPeriod}
          kind={kind}
          onKind={setKind}
          onPrint={() => {
            audit("report_printed", target(), periodLabel);
            printReport(printTitle);
          }}
          printDisabled={busy || !valid || !cls}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label-eyebrow mb-1 block">{t("reports.class")}</label>
              <select className="input-field w-full" value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); }}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classOptionLabel(c, teacherName(c))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-eyebrow mb-1 block">{t("reports.student")}</label>
              <select className="input-field w-full" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{t("sp.wholeClass", "Whole class")}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!studentId && (
            <label className="flex items-center gap-2 text-sm font-semibold text-navy">
              <input type="checkbox" checked={includeEntries} onChange={(e) => setIncludeEntries(e.target.checked)} />
              {t("sp.includeEntries", "Include every entry (additions and deductions)")}
            </label>
          )}
        </ReportControls>
        {busy ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : failed ? (
          <p className="text-sm text-red-600">{t("reports.loadError")}</p>
        ) : (
          sheet
        )}
      </div>
      {!busy && !failed && sheet && staff && <PrintPortal>{sheet}</PrintPortal>}
    </div>
  );
}
