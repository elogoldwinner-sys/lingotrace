import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, subDays } from "date-fns";
import Spinner from "../../components/common/Spinner";
import { useSchool } from "../../contexts/SchoolContext";
import { useAuth } from "../../contexts/AuthContext";
import { useSchoolData } from "../../components/school/SchoolDataContext";
import { SchoolPrintedOn, SchoolSignBlock } from "../../components/school/SchoolReportParts";
import { PrintPortal, printReport, ReportControls, ReportHeader } from "../../components/reports/reportParts";
import { GAINED, HorizontalBars, Legend, LOST } from "../../components/charts/PointsCharts";
import { MultiLineChart, SERIES_COLORS } from "../../components/charts/ComparisonCharts";
import { compareSeries, type SeriesInput } from "../../lib/reports/compareStats";
import { isPeriodValid, describePeriod, type KindFilter, type Period, type Txn } from "../../lib/reports/pointsStats";
import type { ClassRecord, StudentRecord } from "../../types";

type Mode = "classes" | "subjects" | "students";

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
    active ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
  }`;
const sign = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/**
 * Bar graph + line graph comparisons:
 *  1. classes against each other in ONE subject,
 *  2. the subjects of ONE class (e.g. 5-A) against each other (classes across subjects),
 *  3. students of a class against each other.
 */
export default function SchoolComparePage() {
  const { t } = useTranslation();
  const { school } = useSchool();
  const { user, profile } = useAuth();
  const { classes, loading, teacherName, getStudents, getTxns, audit } = useSchoolData();
  const [mode, setMode] = useState<Mode>("classes");
  const [subject, setSubject] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sectionKey, setSectionKey] = useState("");
  const [classId, setClassId] = useState("");
  const [pickedStudents, setPickedStudents] = useState<Set<string>>(new Set());
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [txnsByClass, setTxnsByClass] = useState<Record<string, Txn[]>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<Period>({
    mode: "all",
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [kind, setKind] = useState<KindFilter>("both");
  const logged = useRef(new Set<string>());

  const subjects = useMemo(() => Array.from(new Set(classes.map((c) => c.subject || "").filter(Boolean))).sort(), [classes]);
  const sectionKeys = useMemo(() => Array.from(new Set(classes.map((c) => c.classKey || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [classes]);

  useEffect(() => {
    if (!subject && subjects.length) setSubject(subjects[0]);
    if (!sectionKey && sectionKeys.length) setSectionKey(sectionKeys[0]);
    if (!classId && classes.length) setClassId(classes[0].id);
  }, [subjects, sectionKeys, classes, subject, sectionKey, classId]);

  const subjectClasses = useMemo(() => classes.filter((c) => (c.subject || "") === subject), [classes, subject]);
  useEffect(() => setPicked(new Set(subjectClasses.map((c) => c.id))), [subjectClasses]);
  const sectionClasses = useMemo(() => classes.filter((c) => c.classKey === sectionKey), [classes, sectionKey]);

  // Students of the chosen class (mode 3).
  useEffect(() => {
    if (mode !== "students" || !classId) return;
    getStudents(classId).then((s) => {
      setStudents(s);
      setPickedStudents(new Set(s.slice(0, 8).map((x) => x.id)));
    }).catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, classId]);

  const neededClassIds = useMemo(
    () => (mode === "classes" ? subjectClasses.filter((c) => picked.has(c.id)).map((c) => c.id) : mode === "subjects" ? sectionClasses.map((c) => c.id) : classId ? [classId] : []),
    [mode, subjectClasses, picked, sectionClasses, classId]
  );
  const neededKey = neededClassIds.join(",");

  useEffect(() => {
    if (neededClassIds.length === 0) return;
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    Promise.all(neededClassIds.map((id) => getTxns(id).then((x) => [id, x] as const)))
      .then((rows) => !cancelled && setTxnsByClass((prev) => ({ ...prev, ...Object.fromEntries(rows) })))
      .catch((err) => {
        console.error("Compare load failed", err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey]);

  const clsById = (id: string): ClassRecord | undefined => classes.find((c) => c.id === id);

  const inputs: SeriesInput[] = useMemo(() => {
    if (mode === "classes") {
      return neededClassIds.map((id) => ({ id, label: `${clsById(id)?.classKey || clsById(id)?.name || ""}`, txns: txnsByClass[id] || [] }));
    }
    if (mode === "subjects") {
      return neededClassIds.map((id) => ({ id, label: clsById(id)?.subject || "—", txns: txnsByClass[id] || [] }));
    }
    const all = txnsByClass[classId] || [];
    return students.filter((s) => pickedStudents.has(s.id)).map((s) => ({ id: s.id, label: s.name, txns: all.filter((x) => x.studentId === s.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, neededKey, txnsByClass, students, pickedStudents, classId, classes]);

  const valid = isPeriodValid(period);
  const result = useMemo(() => compareSeries(inputs, valid ? period : { ...period, mode: "all" }, kind), [inputs, period, kind, valid]);
  const colored = result.series.map((s, i) => ({ ...s, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  const bars = [
    { label: t("reports.gained"), color: GAINED },
    { label: t("reports.lost"), color: LOST },
  ];
  const sorted = [...colored].sort((a, b) => b.totals.net - a.totals.net);

  const title =
    mode === "classes"
      ? `${t("sp.cmpClassesIn", "Classes compared in")} ${subject}`
      : mode === "subjects"
        ? `${t("sp.cmpSubjectsOf", "Subjects compared in class")} ${sectionKey}`
        : `${t("sp.cmpStudentsOf", "Students compared in class")} ${clsById(classId)?.classKey || ""} · ${clsById(classId)?.subject || ""}`;
  const periodLabel = period.mode === "all" ? t("reports.periodAllShort") : describePeriod(period, null);

  // Audit trail: once per mode + selection per visit.
  useEffect(() => {
    if (busy || failed || result.series.length === 0) return;
    const key = `${mode}:${title}`;
    if (logged.current.has(key)) return;
    logged.current.add(key);
    audit("report_opened", `${t("sp.compare", "Compare")}: ${title}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, failed, result.series.length, title]);

  const sheet = (
    <div className="lt-report">
      <ReportHeader
        title={t("sp.compareReportTitle", "Comparison report")}
        logo={school?.logoURL}
        lines={[
          { label: t("sp.school", "School"), value: school?.name || "" },
          { label: t("sp.compare", "Compare"), value: title },
          { label: t("reports.period"), value: periodLabel },
        ]}
      />
      {result.series.length === 0 ? (
        <p style={{ color: "#6b7280" }}>{t("reports.noData")}</p>
      ) : (
        <>
          <div className="lt-avoid">
            <h2>{t("sp.barGraph", "Bar graph — points gained and lost")}</h2>
            <HorizontalBars rows={sorted.map((s) => ({ label: s.label, values: [s.totals.gained, s.totals.lost] }))} series={bars} />
            <Legend items={bars} />
          </div>
          <div className="lt-avoid">
            <h2>{t("sp.lineGraph", "Line graph — running total over time")}</h2>
            {result.labels.length > 0 ? (
              <>
                <MultiLineChart labels={result.labels} series={colored.map((s) => ({ label: s.label, color: s.color, values: s.cumulative }))} />
                <Legend items={colored.map((s) => ({ label: s.label, color: s.color }))} />
              </>
            ) : (
              <p style={{ color: "#6b7280" }}>{t("reports.noData")}</p>
            )}
          </div>
          <table className="lt-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{mode === "students" ? t("reports.student") : mode === "subjects" ? t("sp.subject", "Subject") : t("reports.class")}</th>
                <th className="num">{t("reports.gained")}</th>
                <th className="num">{t("reports.lost")}</th>
                <th className="num">{t("reports.net")}</th>
                <th className="num">{t("reports.records")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>{s.label}</td>
                  <td className="num lt-pos">+{s.totals.gained}</td>
                  <td className="num lt-neg">−{s.totals.lost}</td>
                  <td className={`num ${s.totals.net >= 0 ? "lt-pos" : "lt-neg"}`}>{sign(s.totals.net)}</td>
                  <td className="num">{s.totals.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <SchoolSignBlock />
      <SchoolPrintedOn by={profile?.displayName || user?.displayName || user?.email || ""} />
    </div>
  );

  if (loading) return <Spinner />;
  if (classes.length === 0) return <p className="text-sm text-cream-600">{t("sp.noClasses", "No classes to show yet.")}</p>;

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.compareTitle", "Compare")}</h1>
      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {(["classes", "subjects", "students"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${mode === m ? "bg-navy text-white shadow" : "bg-cream-300/50 text-navy hover:bg-cream-300"}`}
            >
              {t(`sp.mode.${m}`, m === "classes" ? "Classes in a subject" : m === "subjects" ? "Subjects of a class" : "Students")}
            </button>
          ))}
        </div>

        <ReportControls
          period={period}
          onPeriod={setPeriod}
          kind={kind}
          onKind={setKind}
          onPrint={() => {
            audit("report_printed", `${t("sp.compare", "Compare")}: ${title}`, periodLabel);
            printReport(`${title}`);
          }}
          printDisabled={busy || !valid || result.series.length === 0}
        >
          {mode === "classes" && (
            <div className="space-y-2">
              <div>
                <label className="label-eyebrow mb-1 block">{t("sp.subject", "Subject")}</label>
                <select className="input-field w-full" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {subjects.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {subjectClasses.map((c) => (
                  <button key={c.id} type="button" className={chip(picked.has(c.id))} onClick={() => toggle(picked, c.id, setPicked)} title={teacherName(c)}>
                    {c.classKey || c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "subjects" && (
            <div>
              <label className="label-eyebrow mb-1 block">{t("reports.class")}</label>
              <div className="flex flex-wrap gap-2">
                {sectionKeys.map((k) => (
                  <button key={k} type="button" className={chip(sectionKey === k)} onClick={() => setSectionKey(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === "students" && (
            <div className="space-y-2">
              <select className="input-field w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{`${c.classKey || c.name} · ${c.subject || "—"} · ${teacherName(c)}`}</option>
                ))}
              </select>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={() => setPickedStudents(new Set(students.map((s) => s.id)))}>
                  {t("sp.selectAll", "Select all")}
                </button>
                <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={() => setPickedStudents(new Set())}>
                  {t("sp.clear", "Clear")}
                </button>
              </div>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {students.map((s) => (
                  <button key={s.id} type="button" className={chip(pickedStudents.has(s.id))} onClick={() => toggle(pickedStudents, s.id, setPickedStudents)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
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
      {!busy && !failed && <PrintPortal>{sheet}</PrintPortal>}
    </div>
  );
}
