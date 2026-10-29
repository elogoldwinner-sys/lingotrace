import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import Modal from "./Modal";
import Spinner from "./Spinner";
import { useAuth } from "../../contexts/AuthContext";
import { getSessionTransactions } from "../../lib/services/pointsService";
import { toMillis } from "../../lib/timestamps";
import { PrintPortal, printReport, ReportHeader, StatCards, PrintedOn } from "../reports/reportParts";
import type { PointsTransaction, SessionRecord, StudentRecord } from "../../types";

interface Row {
  student: StudentRecord;
  gained: number;
  lost: number;
  net: number;
  items: PointsTransaction[];
}

/**
 * Session Summary: every mark given (+) and deducted (−) to each student during one session,
 * with the reason for each. Printable. Only marks given from the Sessions screen are tagged
 * with their session, so marks given before this feature existed don't appear here.
 */
export default function SessionSummaryModal({
  session,
  students,
  teacherId,
  onClose,
}: {
  session: SessionRecord | null;
  students: StudentRecord[];
  teacherId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [txns, setTxns] = useState<PointsTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!session || !teacherId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getSessionTransactions(session.id, teacherId)
      .then((data) => !cancelled && setTxns(data))
      .catch((err) => {
        console.error("Session summary failed", err);
        if (!cancelled) setError(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [session, teacherId]);

  const { rows, totals, quiet } = useMemo(() => {
    const byId = new Map<string, Row>();
    for (const st of students) byId.set(st.id, { student: st, gained: 0, lost: 0, net: 0, items: [] });
    for (const tx of txns) {
      const row = byId.get(tx.studentId);
      if (!row) continue;
      row.items.push(tx);
      if (tx.amount > 0) row.gained += tx.amount;
      else row.lost += -tx.amount;
      row.net += tx.amount;
    }
    const all = Array.from(byId.values());
    const active = all.filter((r) => r.items.length > 0).sort((a, b) => b.net - a.net || a.student.name.localeCompare(b.student.name));
    const gained = active.reduce((n, r) => n + r.gained, 0);
    const lost = active.reduce((n, r) => n + r.lost, 0);
    return {
      rows: active,
      totals: { gained, lost, net: gained - lost, count: txns.length },
      quiet: all.length - active.length,
    };
  }, [txns, students]);

  if (!session) return null;

  const reasonLabel = (tx: PointsTransaction) =>
    tx.reason === "custom" && tx.note ? tx.note : t(`points.reasons.${tx.reason}`, { defaultValue: tx.reason });
  const time = (tx: PointsTransaction) =>
    new Date(toMillis(tx.createdAt)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

  const sheet = (
    <div className="lt-report">
      <ReportHeader
        title={t("sessionSummary.title")}
        logo={profile?.schoolLogoURL}
        lines={[
          { label: t("sessionSummary.session"), value: session.title },
          { label: t("sessionSummary.date"), value: session.date },
          { label: t("reports.teacher"), value: profile?.displayName || "" },
        ]}
      />
      <StatCards totals={totals} />
      {rows.length === 0 ? (
        <p>{t("sessionSummary.empty")}</p>
      ) : (
        <table className="lt-table">
          <thead>
            <tr>
              <th>{t("sessionSummary.student")}</th>
              <th className="num">{t("reports.gained")}</th>
              <th className="num">{t("reports.lost")}</th>
              <th className="num">{t("reports.net")}</th>
              <th>{t("sessionSummary.details")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student.id}>
                <td>
                  <b>{r.student.name}</b>
                </td>
                <td className="num lt-pos">{r.gained ? `+${r.gained}` : "—"}</td>
                <td className="num lt-neg">{r.lost ? `−${r.lost}` : "—"}</td>
                <td className="num">
                  <b>{signed(r.net)}</b>
                </td>
                <td>
                  {r.items.map((tx) => (
                    <div key={tx.id}>
                      <b className={tx.amount > 0 ? "lt-pos" : "lt-neg"}>{signed(tx.amount)}</b> {reasonLabel(tx)}{" "}
                      <span style={{ color: "#6b7280" }}>({time(tx)})</span>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {quiet > 0 && rows.length > 0 && <p className="lt-foot">{t("sessionSummary.noMarks", { count: quiet })}</p>}
      <PrintedOn />
    </div>
  );

  return (
    <>
      <Modal open onClose={onClose} title={`${t("sessionSummary.title")} — ${session.title}`} widthClassName="max-w-3xl">
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading || error}
              onClick={() => printReport(`${t("sessionSummary.title")} - ${session.title}`)}
              className="btn-primary py-2 px-4 text-sm disabled:opacity-50"
            >
              <Printer size={16} />
              {t("reports.print")}
            </button>
          </div>
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
