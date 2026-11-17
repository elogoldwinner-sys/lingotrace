import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { bucketStart, type Bucket, type BucketSize, type Txn } from "../../lib/reports/pointsStats";

const sign = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/**
 * The detailed statement under a report's charts: one row per entry (date, reason, detail, points added or deducted).
 * Every row is tagged with the day / week / month it belongs to, so clicking a chart bar or point can scroll straight
 * to it (see useBucketJump); the clicked period's rows are highlighted until cleared.
 */
export default function DetailedStatement({
  txns,
  size,
  buckets,
  selectedKey,
  onClear,
  studentName,
  screenOnly,
  includeAssess,
}: {
  txns: Txn[];
  size: BucketSize;
  buckets: Bucket[];
  selectedKey: number | null;
  onClear: () => void;
  /** Adds a Student column (class / school reports that cover several students). */
  studentName?: (studentId: string) => string;
  /** Shown on screen only — long class reports would otherwise print dozens of extra pages. */
  screenOnly?: boolean;
  /** Keep mark-sheet entries (quiz, exam…) in the statement; most reports list those in their own section instead. */
  includeAssess?: boolean;
}) {
  const { t } = useTranslation();
  const rows = [...txns].filter((x) => includeAssess || !x.assess).reverse();
  if (rows.length === 0) return null;
  const picked = selectedKey === null ? undefined : buckets.find((b) => b.key === selectedKey);

  return (
    <div className={screenOnly ? "lt-screen-only" : undefined}>
      <h2 data-detail-head>{t("reports.history")}</h2>
      {picked && (
        <p className="lt-sel-bar">
          <span>
            {t("reports.selectedPeriod")}: <strong>{picked.label}</strong> · <span className="lt-pos">+{picked.gained}</span>{" "}
            <span className="lt-neg">−{picked.lost}</span>
          </span>
          <button type="button" onClick={onClear}>
            {t("reports.clearSelection")}
          </button>
        </p>
      )}
      <table className="lt-table">
        <thead>
          <tr>
            <th>{t("reports.colDate")}</th>
            {studentName && <th>{t("reports.student")}</th>}
            <th>{t("reports.colReason")}</th>
            <th>{t("reports.colDetail")}</th>
            <th className="num">{t("reports.colPoints")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => {
            const key = bucketStart(x.at, size);
            const on = key === selectedKey;
            return (
              <tr key={x.id} data-bucket={key} className={on ? "lt-row-sel" : undefined}>
                <td style={{ whiteSpace: "nowrap", background: on ? "#fef3c7" : undefined }}>{x.at ? format(new Date(x.at), "yyyy-MM-dd HH:mm") : ""}</td>
                {studentName && <td style={{ background: on ? "#fef3c7" : undefined }}>{studentName(x.studentId)}</td>}
                <td style={{ background: on ? "#fef3c7" : undefined }}>{t(`points.reasons.${x.reason}`)}</td>
                <td style={{ background: on ? "#fef3c7" : undefined }}>{x.note}</td>
                <td className={`num ${x.amount >= 0 ? "lt-pos" : "lt-neg"}`} style={{ background: on ? "#fef3c7" : undefined }}>
                  {sign(x.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
