import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, getDocs, query, where } from "firebase/firestore";
import { format, subDays } from "date-fns";
import Modal from "../common/Modal";
import Spinner from "../common/Spinner";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import {
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
import type { ClassRecord, PointsTransaction, StudentRecord } from "../../types";

const NET = "#1e3a8a";
/** Students per chart, so a big class's chart can break across printed pages without being cut. */
const CHUNK = 12;

interface SheetProps {
  cls: ClassRecord;
  classes: ClassRecord[];
  studentsByClass: Map<string, StudentRecord[]>;
  txns: Txn[]; // everything the teacher awarded, unfiltered
  period: Period;
  kind: KindFilter;
  logo?: string;
  teacherName: string;
}

function signed(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 10) / 10)}`;
}

function ClassSheet({ cls, classes, studentsByClass, txns, period, kind, logo, teacherName }: SheetProps) {
  const { t } = useTranslation();
  const filtered = useMemo(() => filterTxns(txns, period, kind), [txns, period, kind]);

  /** Totals per class, counting only points of students who are currently in that class. */
  const perClass = useMemo(() => {
    return classes.map((c) => {
      const students = studentsByClass.get(c.id) || [];
      const ids = new Set(students.map((s) => s.id));
      const own = filtered.filter((x) => x.classId === c.id && ids.has(x.studentId));
      const totals = totalsOf(own);
      return { cls: c, students: students.length, totals, avg: students.length ? totals.net / students.length : 0, own };
    });
  }, [classes, studentsByClass, filtered]);

  const mine = perClass.find((p) => p.cls.id === cls.id);
  const students = studentsByClass.get(cls.id) || [];
  const { size, buckets } = useMemo(() => bucketize(mine?.own || [], period), [mine, period]);

  const studentRows = useMemo(() => {
    return students
      .map((s) => {
        const totals = totalsOf((mine?.own || []).filter((x) => x.studentId === s.id));
        return { student: s, totals };
      })
      .sort((a, b) => b.totals.net - a.totals.net || a.student.name.localeCompare(b.student.name));
  }, [students, mine]);

  const ranked = [...perClass].sort((a, b) => b.avg - a.avg);
  const gl = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];
  const kindLabel = kind === "gained" ? t("reports.kindGained") : kind === "lost" ? t("reports.kindLost") : t("reports.kindBoth");
  const firstAt = filtered.length ? filtered[0].at : null;
  const periodLabel =
    period.mode === "all" ? `${t("reports.periodAllShort")} (${describePeriod(period, firstAt)})` : describePeriod(period, firstAt);

  const chunks: (typeof studentRows)[] = [];
  for (let i = 0; i < studentRows.length; i += CHUNK) chunks.push(studentRows.slice(i, i + CHUNK));
  const studentMax = Math.max(...studentRows.flatMap((r) => [r.totals.gained, r.totals.lost]), 0);

  return (
    <div className="lt-report">
      <ReportHeader
        title={t("reports.classReportTitle")}
        logo={logo}
        lines={[
          { label: t("reports.class"), value: cls.name },
          { label: t("reports.teacher"), value: teacherName },
          { label: t("reports.period"), value: periodLabel },
          { label: t("reports.show"), value: kindLabel },
        ]}
      />

      <StatCards totals={mine?.totals || totalsOf([])} extra={{ label: t("reports.students"), value: students.length }} />

      {!mine || mine.own.length === 0 ? (
        <p style={{ marginTop: 16, color: "#6b7280" }}>{t("reports.noData")}</p>
      ) : (
        <>
          <div className="lt-avoid">
            <h2>
              {t("reports.classGainedLostPer")} ({t(`reports.bucket.${size}`)})
            </h2>
            <GainedLostBars buckets={buckets} />
            <Legend items={gl} />
          </div>
          <div className="lt-avoid">
            <h2>{t("reports.classRunningTotal")}</h2>
            <RunningTotalLine buckets={buckets} />
          </div>
        </>
      )}

      <h2>{t("reports.studentsCompared")}</h2>
      {studentRows.length === 0 ? (
        <p style={{ color: "#6b7280" }}>{t("students.noStudents")}</p>
      ) : (
        <>
          {chunks.map((chunk, i) => (
            <div key={i} className="lt-avoid" style={{ marginBottom: 6 }}>
              <HorizontalBars
                maxValue={studentMax}
                rows={chunk.map((r) => ({ label: r.student.name, values: [r.totals.gained, r.totals.lost] }))}
                series={gl}
              />
            </div>
          ))}
          <Legend items={gl} />
          <table className="lt-table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>{t("reports.student")}</th>
                <th className="num">{t("reports.gained")}</th>
                <th className="num">{t("reports.lost")}</th>
                <th className="num">{t("reports.net")}</th>
                <th className="num">{t("reports.currentTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.map((r, i) => (
                <tr key={r.student.id}>
                  <td>{i + 1}</td>
                  <td>{r.student.name}</td>
                  <td className="num lt-pos">{r.totals.gained ? `+${r.totals.gained}` : "0"}</td>
                  <td className="num lt-neg">{r.totals.lost ? `−${r.totals.lost}` : "0"}</td>
                  <td className={`num ${r.totals.net >= 0 ? "lt-pos" : "lt-neg"}`}>{signed(r.totals.net)}</td>
                  <td className="num">{r.student.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>{t("reports.classesCompared")}</h2>
      {perClass.length < 2 ? (
        <p style={{ color: "#6b7280" }}>{t("reports.onlyOneClass")}</p>
      ) : (
        <>
          <div className="lt-avoid">
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>{t("reports.avgPerStudentHint")}</p>
            <HorizontalBars
              rows={ranked.map((p) => ({ label: p.cls.name, values: [Math.max(p.avg, 0)], highlight: p.cls.id === cls.id }))}
              series={[{ label: t("reports.avgPerStudent"), color: NET }]}
            />
            <Legend items={[{ label: t("reports.avgPerStudent"), color: NET }]} />
          </div>
          <div className="lt-avoid" style={{ marginTop: 10 }}>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>{t("reports.totalsPerClass")}</p>
            <HorizontalBars
              rows={ranked.map((p) => ({ label: p.cls.name, values: [p.totals.gained, p.totals.lost], highlight: p.cls.id === cls.id }))}
              series={gl}
            />
            <Legend items={gl} />
          </div>
          <table className="lt-table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>{t("reports.class")}</th>
                <th className="num">{t("reports.students")}</th>
                <th className="num">{t("reports.gained")}</th>
                <th className="num">{t("reports.lost")}</th>
                <th className="num">{t("reports.net")}</th>
                <th className="num">{t("reports.avgPerStudent")}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr key={p.cls.id} style={p.cls.id === cls.id ? { background: "#fef3c7", fontWeight: 700 } : undefined}>
                  <td>{p.cls.name}</td>
                  <td className="num">{p.students}</td>
                  <td className="num lt-pos">{p.totals.gained ? `+${p.totals.gained}` : "0"}</td>
                  <td className="num lt-neg">{p.totals.lost ? `−${p.totals.lost}` : "0"}</td>
                  <td className={`num ${p.totals.net >= 0 ? "lt-pos" : "lt-neg"}`}>{signed(p.totals.net)}</td>
                  <td className="num">{signed(p.avg)}</td>
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
 * Class statistics: every student of the class compared with each other, and
 * the class compared with the teacher's other classes — for the entire period
 * since the beginning or between two dates. Printable.
 */
export default function ClassStatsModal({
  open,
  onClose,
  classes,
  defaultClassId,
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassRecord[];
  defaultClassId: string;
}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const [classId, setClassId] = useState(defaultClassId);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Map<string, StudentRecord[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>({
    mode: "all",
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [kind, setKind] = useState<KindFilter>("both");

  useEffect(() => {
    if (open) setClassId(defaultClassId || classes[0]?.id || "");
  }, [open, defaultClassId, classes]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const [pointsSnap, ...studentSnaps] = await Promise.all([
          getDocs(query(collection(db, "pointsTransactions"), where("awardedBy", "==", user.uid))),
          ...classes.map((c) => getDocs(query(collection(db, "students"), where("classId", "==", c.id)))),
        ]);
        if (cancelled) return;
        setTxns(pointsSnap.docs.map((d) => toTxn({ ...(d.data() as PointsTransaction), id: d.id })));
        const map = new Map<string, StudentRecord[]>();
        classes.forEach((c, i) =>
          map.set(
            c.id,
            studentSnaps[i].docs.map((d) => ({ ...(d.data() as StudentRecord), id: d.id }))
          )
        );
        setStudentsByClass(map);
      } catch (err) {
        console.error("Class statistics failed", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, classes]);

  const cls = classes.find((c) => c.id === classId);
  const valid = isPeriodValid(period);
  if (!open) return null;

  const sheet = cls ? (
    <ClassSheet
      cls={cls}
      classes={classes}
      studentsByClass={studentsByClass}
      txns={valid ? txns : []}
      period={period}
      kind={kind}
      logo={profile?.schoolLogoURL}
      teacherName={profile?.displayName || ""}
    />
  ) : null;

  return (
    <>
      <Modal open={open} onClose={onClose} title={t("reports.classStats")} widthClassName="max-w-3xl">
        <div className="space-y-4">
          <ReportControls
            period={period}
            onPeriod={setPeriod}
            kind={kind}
            onKind={setKind}
            onPrint={() => printReport(`${cls?.name || ""} - ${t("reports.classReportTitle")}`)}
            printDisabled={loading || !valid || !cls}
          >
            <div>
              <label className="label-eyebrow mb-1 block">{t("reports.class")}</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field w-full">
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </ReportControls>
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
      {!loading && !error && sheet && <PrintPortal>{sheet}</PrintPortal>}
    </>
  );
}
