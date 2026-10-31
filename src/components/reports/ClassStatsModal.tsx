import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, getDocs, query, where } from "firebase/firestore";
import { format, subDays } from "date-fns";
import Modal from "../common/Modal";
import Spinner from "../common/Spinner";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useSubjectCompareAllowed } from "../../contexts/SchoolContext";
import {
  bucketize,
  describePeriod,
  filterTxns,
  isPeriodValid,
  toTxn,
  totalsOf,
  type KindFilter,
  type Period,
  type Totals,
  type Txn,
} from "../../lib/reports/pointsStats";
import { GAINED, GainedLostBars, HorizontalBars, Legend, LOST, RunningTotalLine } from "../charts/PointsCharts";
import { PrintedOn, PrintPortal, printReport, ReportControls, ReportHeader, StatCards } from "./reportParts";
import type { ClassRecord, PointsTransaction, StudentRecord } from "../../types";

export type StatsTab = "students" | "classes" | "subjects";

const NET = "#1e3a8a";
/** Students per chart, so a big class's chart can break across printed pages without being cut. */
const CHUNK = 12;

function signed(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 10) / 10)}`;
}
const nameKey = (name: string) => name.trim().toLowerCase();

interface Common {
  period: Period;
  kind: KindFilter;
  logo?: string;
  teacherName: string;
}

function useLabels(period: Period, kind: KindFilter, firstAt: number | null) {
  const { t } = useTranslation();
  const kindLabel = kind === "gained" ? t("reports.kindGained") : kind === "lost" ? t("reports.kindLost") : t("reports.kindBoth");
  const periodLabel =
    period.mode === "all" ? `${t("reports.periodAllShort")} (${describePeriod(period, firstAt)})` : describePeriod(period, firstAt);
  return { kindLabel, periodLabel };
}

/** Points of the students who are currently in the class, from an already period/kind-filtered list. */
function classTotals(cls: ClassRecord, students: StudentRecord[], filtered: Txn[]) {
  const ids = new Set(students.map((s) => s.id));
  const own = filtered.filter((x) => x.classId === cls.id && ids.has(x.studentId));
  const totals = totalsOf(own);
  return { cls, students: students.length, totals, avg: students.length ? totals.net / students.length : 0, own };
}

/* ───────────────────────── Tab 1: the students of one class ───────────────────────── */

function StudentsSheet({
  cls,
  students,
  txns,
  period,
  kind,
  logo,
  teacherName,
}: Common & { cls: ClassRecord; students: StudentRecord[]; txns: Txn[] }) {
  const { t } = useTranslation();
  const filtered = useMemo(() => filterTxns(txns, period, kind), [txns, period, kind]);
  const mine = useMemo(() => classTotals(cls, students, filtered), [cls, students, filtered]);
  const { size, buckets } = useMemo(() => bucketize(mine.own, period), [mine, period]);
  const { kindLabel, periodLabel } = useLabels(period, kind, filtered.length ? filtered[0].at : null);

  const studentRows = useMemo(
    () =>
      students
        .map((s) => ({ student: s, totals: totalsOf(mine.own.filter((x) => x.studentId === s.id)) }))
        .sort((a, b) => b.totals.net - a.totals.net || a.student.name.localeCompare(b.student.name)),
    [students, mine]
  );
  const gl = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];
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
      <StatCards totals={mine.totals} extra={{ label: t("reports.students"), value: students.length }} />

      {mine.own.length === 0 ? (
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
      <PrintedOn />
    </div>
  );
}

/* ───────────────────────── Tab 2: compare classes ───────────────────────── */

function ClassesSheet({
  classes,
  studentsByClass,
  txns,
  period,
  kind,
  logo,
  teacherName,
}: Common & { classes: ClassRecord[]; studentsByClass: Map<string, StudentRecord[]>; txns: Txn[] }) {
  const { t } = useTranslation();
  const filtered = useMemo(() => filterTxns(txns, period, kind), [txns, period, kind]);
  const ranked = useMemo(
    () =>
      classes
        .map((c) => classTotals(c, studentsByClass.get(c.id) || [], filtered))
        .sort((a, b) => b.avg - a.avg),
    [classes, studentsByClass, filtered]
  );
  const { kindLabel, periodLabel } = useLabels(period, kind, filtered.length ? filtered[0].at : null);
  const gl = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];

  return (
    <div className="lt-report">
      <ReportHeader
        title={t("reports.classesReportTitle")}
        logo={logo}
        lines={[
          { label: t("reports.teacher"), value: teacherName },
          { label: t("reports.period"), value: periodLabel },
          { label: t("reports.show"), value: kindLabel },
        ]}
      />
      {ranked.length < 2 ? (
        <p style={{ marginTop: 12, color: "#6b7280" }}>{t("reports.pickTwoClasses")}</p>
      ) : (
        <>
          <div className="lt-avoid">
            <h2>{t("reports.avgPerStudent")}</h2>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>{t("reports.avgPerStudentHint")}</p>
            <HorizontalBars
              rows={ranked.map((p) => ({ label: p.cls.name, values: [Math.max(p.avg, 0)] }))}
              series={[{ label: t("reports.avgPerStudent"), color: NET }]}
            />
          </div>
          <div className="lt-avoid">
            <h2>{t("reports.totalsPerClass")}</h2>
            <HorizontalBars rows={ranked.map((p) => ({ label: p.cls.name, values: [p.totals.gained, p.totals.lost] }))} series={gl} />
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
                <tr key={p.cls.id}>
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

/* ───────────────────────── Tab 3: across subjects (classroom teacher) ───────────────────────── */

interface SubjectGroup {
  main: ClassRecord;
  members: { cls: ClassRecord; label: string }[];
  notJoined: number;
}

function SubjectsSheet({
  group,
  studentsByClass,
  txns,
  totalsOnly,
  studentKeyChosen,
  period,
  kind,
  logo,
  teacherName,
}: Common & {
  group: SubjectGroup;
  studentsByClass: Map<string, StudentRecord[]>;
  txns: Txn[];
  /** True when the subject teachers' points history can't be read yet — only each student's current total is available. */
  totalsOnly: boolean;
  studentKeyChosen: string;
}) {
  const { t } = useTranslation();
  const filtered = useMemo(() => filterTxns(txns, period, kind), [txns, period, kind]);
  const { kindLabel, periodLabel } = useLabels(period, kind, filtered.length ? filtered[0].at : null);
  const gl = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];

  /** Per subject: its totals, and each student's totals keyed by student name. */
  const subjects = useMemo(
    () =>
      group.members.map((m) => {
        const students = studentsByClass.get(m.cls.id) || [];
        const base = classTotals(m.cls, students, filtered);
        const byName = new Map<string, Totals>();
        students.forEach((s) => {
          byName.set(
            nameKey(s.name),
            totalsOnly
              ? { gained: 0, lost: 0, net: s.points, count: 0 }
              : totalsOf(base.own.filter((x) => x.studentId === s.id))
          );
        });
        const totals: Totals = totalsOnly
          ? { gained: 0, lost: 0, net: students.reduce((a, s) => a + s.points, 0), count: 0 }
          : base.totals;
        return { label: m.label, students: students.length, totals, avg: students.length ? totals.net / students.length : 0, byName };
      }),
    [group, studentsByClass, filtered, totalsOnly]
  );

  const displayNames = useMemo(() => {
    const map = new Map<string, string>();
    group.members.forEach((m) => (studentsByClass.get(m.cls.id) || []).forEach((s) => map.has(nameKey(s.name)) || map.set(nameKey(s.name), s.name)));
    return map;
  }, [group, studentsByClass]);

  const matrix = useMemo(
    () =>
      Array.from(displayNames.entries())
        .map(([key, name]) => {
          const cells = subjects.map((s) => s.byName.get(key)?.net ?? null);
          const sum = cells.reduce<number>((a, v) => a + (v ?? 0), 0);
          return { key, name, cells, sum };
        })
        .sort((a, b) => b.sum - a.sum || a.name.localeCompare(b.name)),
    [displayNames, subjects]
  );

  const chosen = studentKeyChosen ? displayNames.get(studentKeyChosen) : undefined;

  return (
    <div className="lt-report">
      <ReportHeader
        title={t("reports.subjectsReportTitle")}
        logo={logo}
        lines={[
          { label: t("reports.class"), value: group.main.name },
          { label: t("reports.teacher"), value: teacherName },
          { label: t("reports.period"), value: totalsOnly ? t("reports.periodAllShort") : periodLabel },
          ...(totalsOnly ? [] : [{ label: t("reports.show"), value: kindLabel }]),
        ]}
      />
      {totalsOnly && <p style={{ color: "#b45309", fontSize: 12, margin: "0 0 8px" }}>{t("reports.totalsOnlyNote")}</p>}

      <h2>{t("reports.subjectsCompared")}</h2>
      {totalsOnly ? (
        <div className="lt-avoid">
          <HorizontalBars
            rows={subjects.map((s) => ({ label: s.label, values: [Math.max(s.avg, 0)] }))}
            series={[{ label: t("reports.avgPerStudent"), color: NET }]}
          />
          <Legend items={[{ label: t("reports.avgPerStudent"), color: NET }]} />
        </div>
      ) : (
        <>
          <div className="lt-avoid">
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>{t("reports.avgPerStudentHint")}</p>
            <HorizontalBars
              rows={subjects.map((s) => ({ label: s.label, values: [Math.max(s.avg, 0)] }))}
              series={[{ label: t("reports.avgPerStudent"), color: NET }]}
            />
          </div>
          <div className="lt-avoid" style={{ marginTop: 8 }}>
            <HorizontalBars rows={subjects.map((s) => ({ label: s.label, values: [s.totals.gained, s.totals.lost] }))} series={gl} />
            <Legend items={gl} />
          </div>
        </>
      )}
      <table className="lt-table" style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>{t("reports.subject")}</th>
            <th className="num">{t("reports.students")}</th>
            {!totalsOnly && <th className="num">{t("reports.gained")}</th>}
            {!totalsOnly && <th className="num">{t("reports.lost")}</th>}
            <th className="num">{t("reports.net")}</th>
            <th className="num">{t("reports.avgPerStudent")}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td className="num">{s.students}</td>
              {!totalsOnly && <td className="num lt-pos">{s.totals.gained ? `+${s.totals.gained}` : "0"}</td>}
              {!totalsOnly && <td className="num lt-neg">{s.totals.lost ? `−${s.totals.lost}` : "0"}</td>}
              <td className={`num ${s.totals.net >= 0 ? "lt-pos" : "lt-neg"}`}>{signed(s.totals.net)}</td>
              <td className="num">{signed(s.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {group.notJoined > 0 && (
        <p className="lt-foot">{t("reports.notJoined", { count: group.notJoined })}</p>
      )}

      {chosen && (
        <div className="lt-avoid">
          <h2>
            {t("reports.studentAcrossSubjects")}: {chosen}
          </h2>
          <HorizontalBars
            rows={subjects.map((s) => {
              const v = s.byName.get(studentKeyChosen);
              return { label: s.label, values: totalsOnly ? [Math.max(v?.net ?? 0, 0)] : [v?.gained ?? 0, v?.lost ?? 0] };
            })}
            series={totalsOnly ? [{ label: t("reports.net"), color: NET }] : gl}
          />
          <Legend items={totalsOnly ? [{ label: t("reports.net"), color: NET }] : gl} />
        </div>
      )}

      <h2>{t("reports.matrixTitle")}</h2>
      <table className="lt-table">
        <thead>
          <tr>
            <th>{t("reports.student")}</th>
            {subjects.map((s) => (
              <th key={s.label} className="num">
                {s.label}
              </th>
            ))}
            <th className="num">{t("reports.sum")}</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((r) => (
            <tr key={r.key}>
              <td>{r.name}</td>
              {r.cells.map((v, i) => (
                <td key={i} className={`num ${v === null ? "" : v >= 0 ? "lt-pos" : "lt-neg"}`}>
                  {v === null ? "–" : signed(v)}
                </td>
              ))}
              <td className="num" style={{ fontWeight: 700 }}>
                {signed(r.sum)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PrintedOn />
    </div>
  );
}

/* ───────────────────────── The window ───────────────────────── */

interface LoadedData {
  txns: Txn[];
  studentsByClass: Map<string, StudentRecord[]>;
  groups: SubjectGroup[];
  /** The subject teachers' points can't be read (Firestore rules not updated yet). */
  rulesMissing: boolean;
}

/**
 * Class statistics. Three views, switched with tabs:
 *  1. the students of one class compared with each other,
 *  2. several of the teacher's classes compared with each other,
 *  3. (classroom teachers only) one class compared across its subjects, and a
 *     single student across subjects.
 * All of them work for the entire period since the beginning or for chosen
 * dates, and the open view can be printed.
 */
export default function ClassStatsModal({
  open,
  onClose,
  classes,
  defaultClassId,
  initialTab = "students",
}: {
  open: boolean;
  onClose: () => void;
  classes: ClassRecord[];
  defaultClassId: string;
  initialTab?: StatsTab;
}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  // The school principal can switch "compare across subjects" off for the school's teachers.
  const subjectCompareAllowed = useSubjectCompareAllowed();
  const [tab, setTab] = useState<StatsTab>(initialTab);
  const [classId, setClassId] = useState(defaultClassId);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState("");
  const [studentKey, setStudentKey] = useState("");
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>({
    mode: "all",
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [kind, setKind] = useState<KindFilter>("both");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab === "subjects" && !subjectCompareAllowed ? "students" : initialTab);
    setClassId(defaultClassId || classes[0]?.id || "");
    setCompareIds(new Set(classes.map((c) => c.id)));
    setStudentKey("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab, defaultClassId]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const studentsOf = (cid: string) => getDocs(query(collection(db, "students"), where("classId", "==", cid)));
        const [pointsSnap, givenSnap, ...studentSnaps] = await Promise.all([
          getDocs(query(collection(db, "pointsTransactions"), where("awardedBy", "==", user.uid))),
          getDocs(query(collection(db, "classes"), where("ownerId", "==", user.uid))),
          ...classes.map((c) => studentsOf(c.id)),
        ]);
        const toStudents = (snap: typeof pointsSnap) =>
          snap.docs.map((d) => ({ ...(d.data() as StudentRecord), id: d.id }));
        const studentsByClass = new Map<string, StudentRecord[]>();
        classes.forEach((c, i) => studentsByClass.set(c.id, toStudents(studentSnaps[i])));
        const txnMap = new Map<string, Txn>();
        pointsSnap.docs.forEach((d) => txnMap.set(d.id, toTxn({ ...(d.data() as PointsTransaction), id: d.id })));

        // Subject classes this teacher handed to co-teachers (the classroom-teacher feature).
        const given = givenSnap.docs
          .map((d) => ({ ...(d.data() as ClassRecord), id: d.id }))
          .filter((g) => g.teacherId !== user.uid);
        const joined = given.filter((g) => g.teacherId);
        let rulesMissing = false;
        await Promise.all(
          joined.map(async (g) => {
            studentsByClass.set(g.id, toStudents(await studentsOf(g.id)));
            try {
              const snap = await getDocs(query(collection(db, "pointsTransactions"), where("classId", "==", g.id)));
              snap.docs.forEach((d) => txnMap.set(d.id, toTxn({ ...(d.data() as PointsTransaction), id: d.id })));
            } catch {
              rulesMissing = true;
            }
          })
        );
        const groups: SubjectGroup[] = classes
          .filter((c) => !c.parentClassId && given.some((g) => g.parentClassId === c.id))
          .map((main) => ({
            main,
            members: [
              { cls: main, label: main.subject || t("reports.mainSubject") },
              ...joined.filter((g) => g.parentClassId === main.id).map((g) => ({ cls: g, label: g.subject || g.name })),
            ],
            notJoined: given.filter((g) => g.parentClassId === main.id && !g.teacherId).length,
          }));
        if (!cancelled) setData({ txns: Array.from(txnMap.values()), studentsByClass, groups, rulesMissing });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, classes]);

  const hasSubjects = subjectCompareAllowed && !!data && data.groups.length > 0;
  const group = data?.groups.find((g) => g.main.id === groupId) || data?.groups.find((g) => g.main.id === defaultClassId) || data?.groups[0];
  const cls = classes.find((c) => c.id === classId);
  const valid = isPeriodValid(period);

  const studentOptions = useMemo(() => {
    if (!group || !data) return [];
    const seen = new Map<string, string>();
    group.members.forEach((m) => (data.studentsByClass.get(m.cls.id) || []).forEach((s) => seen.has(nameKey(s.name)) || seen.set(nameKey(s.name), s.name)));
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [group, data]);

  if (!open) return null;

  const common = { period, kind, logo: profile?.schoolLogoURL, teacherName: profile?.displayName || "" };
  const txns = valid && data ? data.txns : [];
  let sheet: React.ReactNode = null;
  let printTitle = "";
  if (data) {
    if (tab === "students" && cls) {
      printTitle = `${cls.name} - ${t("reports.classReportTitle")}`;
      sheet = <StudentsSheet {...common} cls={cls} students={data.studentsByClass.get(cls.id) || []} txns={txns} />;
    } else if (tab === "classes") {
      printTitle = t("reports.classesReportTitle");
      sheet = (
        <ClassesSheet
          {...common}
          classes={classes.filter((c) => compareIds.has(c.id))}
          studentsByClass={data.studentsByClass}
          txns={txns}
        />
      );
    } else if (tab === "subjects" && group) {
      printTitle = `${group.main.name} - ${t("reports.subjectsReportTitle")}`;
      sheet = (
        <SubjectsSheet
          {...common}
          group={group}
          studentsByClass={data.studentsByClass}
          txns={txns}
          totalsOnly={data.rulesMissing}
          studentKeyChosen={studentKey}
        />
      );
    }
  }

  const tabBtn = (id: StatsTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
        tab === id ? "bg-navy text-white shadow" : "bg-cream-300/50 text-navy hover:bg-cream-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <Modal open={open} onClose={onClose} title={t("reports.classStats")} widthClassName="max-w-3xl">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {tabBtn("students", t("reports.tabStudents"))}
            {tabBtn("classes", t("reports.tabClasses"))}
            {hasSubjects && tabBtn("subjects", t("reports.tabSubjects"))}
          </div>

          <ReportControls
            period={period}
            onPeriod={setPeriod}
            kind={kind}
            onKind={setKind}
            onPrint={() => printReport(printTitle)}
            printDisabled={loading || !valid || !sheet}
          >
            {tab === "students" && (
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
            )}
            {tab === "classes" && (
              <div>
                <label className="label-eyebrow mb-1 block">{t("reports.pickClasses")}</label>
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => {
                    const on = compareIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setCompareIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                          on ? "border-navy bg-navy text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {tab === "subjects" && group && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data && data.groups.length > 1 && (
                  <div>
                    <label className="label-eyebrow mb-1 block">{t("reports.class")}</label>
                    <select
                      value={group.main.id}
                      onChange={(e) => {
                        setGroupId(e.target.value);
                        setStudentKey("");
                      }}
                      className="input-field w-full"
                    >
                      {data.groups.map((g) => (
                        <option key={g.main.id} value={g.main.id}>
                          {g.main.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label-eyebrow mb-1 block">{t("reports.studentAcrossSubjects")}</label>
                  <select value={studentKey} onChange={(e) => setStudentKey(e.target.value)} className="input-field w-full">
                    <option value="">{t("reports.allStudentsOption")}</option>
                    {studentOptions.map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
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
