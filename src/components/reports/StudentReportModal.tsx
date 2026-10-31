import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, getDocs, query, where } from "firebase/firestore";
import { format, subDays } from "date-fns";
import Modal from "../common/Modal";
import Spinner from "../common/Spinner";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useEffectiveSchoolLogo } from "../../contexts/SchoolContext";
import {
  byReason,
  bucketize,
  describePeriod,
  filterTxns,
  isPeriodValid,
  toTxn,
  totalsOf,
  type KindFilter,
  type Period,
  type Txn,
} from "../../lib/reports/pointsStats";
import { GAINED, GainedLostBars, HorizontalBars, Legend, LOST, RunningTotalLine } from "../charts/PointsCharts";
import { PrintedOn, PrintPortal, printReport, ReportControls, ReportHeader, StatCards } from "./reportParts";
import type { PointsTransaction, StudentRecord } from "../../types";

interface SheetProps {
  student: StudentRecord;
  className: string;
  period: Period;
  kind: KindFilter;
  txns: Txn[];
  firstAt: number | null;
  logo?: string;
  teacherName: string;
}

/** The report itself — shown in the window as a preview and rendered again (identically) for printing. */
function StudentSheet({ student, className, period, kind, txns, firstAt, logo, teacherName }: SheetProps) {
  const { t } = useTranslation();
  const totals = totalsOf(txns);
  const { size, buckets } = useMemo(() => bucketize(txns, period), [txns, period]);
  const reasons = useMemo(() => byReason(txns), [txns]);
  const series = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];
  const kindLabel = kind === "gained" ? t("reports.kindGained") : kind === "lost" ? t("reports.kindLost") : t("reports.kindBoth");
  const periodLabel =
    period.mode === "all" ? `${t("reports.periodAllShort")} (${describePeriod(period, firstAt)})` : describePeriod(period, firstAt);

  return (
    <div className="lt-report">
      <ReportHeader
        title={t("reports.studentReportTitle")}
        logo={logo}
        lines={[
          { label: t("reports.student"), value: student.name },
          { label: t("reports.class"), value: className },
          ...(student.group ? [{ label: t("students.group"), value: student.group }] : []),
          { label: t("reports.teacher"), value: teacherName },
          { label: t("reports.period"), value: periodLabel },
          { label: t("reports.show"), value: kindLabel },
        ]}
      />

      <StatCards totals={totals} extra={{ label: t("reports.currentTotal"), value: student.points }} />

      {txns.length === 0 ? (
        <p style={{ marginTop: 16, color: "#6b7280" }}>{t("reports.noData")}</p>
      ) : (
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
            <HorizontalBars
              rows={reasons.map((r) => ({ label: t(`points.reasons.${r.reason}`), values: [r.gained, r.lost] }))}
              series={series}
            />
            <Legend items={series} />
          </div>

          <h2>{t("reports.history")}</h2>
          <table className="lt-table">
            <thead>
              <tr>
                <th>{t("reports.colDate")}</th>
                <th>{t("reports.colReason")}</th>
                <th>{t("reports.colDetail")}</th>
                <th className="num">{t("reports.colPoints")}</th>
              </tr>
            </thead>
            <tbody>
              {[...txns].reverse().map((x) => (
                <tr key={x.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{x.at ? format(new Date(x.at), "yyyy-MM-dd HH:mm") : ""}</td>
                  <td>{t(`points.reasons.${x.reason}`)}</td>
                  <td>{x.note}</td>
                  <td className={`num ${x.amount >= 0 ? "lt-pos" : "lt-neg"}`}>
                    {x.amount > 0 ? "+" : x.amount < 0 ? "−" : ""}
                    {Math.abs(x.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <PrintedOn />
    </div>
  );
}

/**
 * A student's points report: what was gained and/or lost, for the entire
 * period since the beginning or between two dates, with graphs. Can be
 * printed (or saved as PDF) from the browser's print dialog.
 */
export default function StudentReportModal({
  open,
  onClose,
  student,
  className,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentRecord | null;
  className: string;
}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const { logo: schoolLogo } = useEffectiveSchoolLogo();
  const [all, setAll] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>({
    mode: "all",
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [kind, setKind] = useState<KindFilter>("both");

  useEffect(() => {
    if (!open || !student || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setAll([]);
    // Filtering on `awardedBy` as well keeps the query inside the Firestore rule (teachers read the points they awarded).
    getDocs(
      query(
        collection(db, "pointsTransactions"),
        where("studentId", "==", student.id),
        where("awardedBy", "==", user.uid)
      )
    )
      .then((snap) => {
        if (cancelled) return;
        setAll(snap.docs.map((d) => toTxn({ ...(d.data() as PointsTransaction), id: d.id })));
      })
      .catch((err) => {
        console.error("Student report failed", err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, student, user]);

  const valid = isPeriodValid(period);
  const txns = useMemo(() => (valid ? filterTxns(all, period, kind) : []), [all, period, kind, valid]);
  const firstAt = all.length ? Math.min(...all.map((x) => x.at)) : null;

  if (!open || !student) return null;

  const sheet = (
    <StudentSheet
      student={student}
      className={className}
      period={period}
      kind={kind}
      txns={txns}
      firstAt={firstAt}
      logo={schoolLogo}
      teacherName={profile?.displayName || ""}
    />
  );

  return (
    <>
      <Modal open={open} onClose={onClose} title={`${t("reports.studentReport")} — ${student.name}`} widthClassName="max-w-3xl">
        <div className="space-y-4">
          <ReportControls
            period={period}
            onPeriod={setPeriod}
            kind={kind}
            onKind={setKind}
            onPrint={() => printReport(`${student.name} - ${t("reports.studentReportTitle")}`)}
            printDisabled={loading || !valid}
          />
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{t("reports.loadError")}</p>
          ) : (
            sheet
          )}
        </div>
      </Modal>
      {!loading && !error && <PrintPortal>{sheet}</PrintPortal>}
    </>
  );
}
