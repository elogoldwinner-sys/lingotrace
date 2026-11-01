import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { kindLabel } from "../../lib/assessments";
import type { Txn } from "../../lib/reports/pointsStats";

const dateOf = (ms: number) => (ms ? format(new Date(ms), "yyyy-MM-dd") : "");

/** One student's quizzes, exams, spelling exams and projects (from the mark sheet). Shown before the detailed points. */
export function StudentAssessments({ txns }: { txns: Txn[] }) {
  const { t } = useTranslation();
  const rows = useMemo(() => txns.filter((x) => x.assess).sort((a, b) => a.at - b.at), [txns]);
  if (rows.length === 0) return null;
  return (
    <div>
      <h2>{t("assess.title", "Assessments")}</h2>
      <table className="lt-table">
        <thead>
          <tr>
            <th>{t("assess.colDate", "Date")}</th>
            <th>{t("assess.colType", "Type")}</th>
            <th>{t("assess.colName", "Name")}</th>
            <th className="num">{t("assess.colMark", "Mark")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td style={{ whiteSpace: "nowrap" }}>{dateOf(x.at)}</td>
              <td>{kindLabel(t, x.assess!.kind, x.assess!.label)}</td>
              <td>{x.assess!.name}</td>
              <td className="num">{x.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A whole class's assessments, one row each, with how the class did. Shown near the top of the class report. */
export function ClassAssessments({ txns }: { txns: Txn[] }) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const groups = new Map<string, { kind: string; label: string; name: string; first: number; marks: number[] }>();
    for (const x of txns) {
      if (!x.assess) continue;
      const key = `${x.assess.kind}\u0001${x.assess.label}\u0001${x.assess.name}`;
      const g = groups.get(key) || { kind: x.assess.kind, label: x.assess.label, name: x.assess.name, first: x.at, marks: [] };
      g.first = Math.min(g.first, x.at);
      g.marks.push(x.amount);
      groups.set(key, g);
    }
    return Array.from(groups.values()).sort((a, b) => a.first - b.first);
  }, [txns]);
  if (rows.length === 0) return null;
  return (
    <div className="lt-avoid">
      <h2>{t("assess.title", "Assessments")}</h2>
      <table className="lt-table">
        <thead>
          <tr>
            <th>{t("assess.colDate", "Date")}</th>
            <th>{t("assess.colType", "Type")}</th>
            <th>{t("assess.colName", "Name")}</th>
            <th className="num">{t("assess.colGraded", "Students")}</th>
            <th className="num">{t("assess.colAvg", "Average")}</th>
            <th className="num">{t("assess.colHigh", "Highest")}</th>
            <th className="num">{t("assess.colLow", "Lowest")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: "nowrap" }}>{dateOf(g.first)}</td>
              <td>{kindLabel(t, g.kind, g.label)}</td>
              <td>{g.name}</td>
              <td className="num">{g.marks.length}</td>
              <td className="num">{(g.marks.reduce((s, m) => s + m, 0) / g.marks.length).toFixed(1)}</td>
              <td className="num">{Math.max(...g.marks)}</td>
              <td className="num">{Math.min(...g.marks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
