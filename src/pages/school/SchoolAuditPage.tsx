import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import Spinner from "../../components/common/Spinner";
import { useSchool } from "../../contexts/SchoolContext";
import { listAudit } from "../../lib/services/schoolService";
import type { AuditEntry } from "../../types";

/** Principal only: who opened or printed which report, who sent feedback, and teacher approvals. */
export default function SchoolAuditPage() {
  const { t } = useTranslation();
  const { staff, school } = useSchool();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!school || staff?.role !== "principal") return;
    listAudit(school.id)
      .then(setRows)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [school, staff]);

  if (staff?.role !== "principal") return <Navigate to="/school" replace />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">{t("sp.auditTitle", "Audit trail")}</h1>
      <p className="text-sm text-cream-600">{t("sp.auditSub", "The latest 300 actions: reports opened and printed, feedback sent, teacher approvals.")}</p>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-600">{t("sp.loadError", "Couldn't load the schools. Please try again.")}</p>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-center text-sm text-cream-600">{t("sp.auditEmpty", "Nothing recorded yet.")}</div>
      ) : (
        <div className="card overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-cream-600">
                <th className="p-2 text-start">{t("reports.colDate")}</th>
                <th className="p-2 text-start">{t("sp.who", "Who")}</th>
                <th className="p-2 text-start">{t("sp.action", "Action")}</th>
                <th className="p-2 text-start">{t("sp.aboutCol", "About")}</th>
                <th className="p-2 text-start">{t("reports.period")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-cream-400/50 align-top">
                  <td className="whitespace-nowrap p-2">{r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : ""}</td>
                  <td className="p-2">
                    <span className="font-semibold text-navy">{r.actorName}</span>
                    <span className="block text-xs text-cream-600">{r.actorEmail} · {t(`sp.role.${r.actorRole}`, r.actorRole)}</span>
                  </td>
                  <td className="p-2">{t(`sp.audit.${r.action}`, r.action)}</td>
                  <td className="p-2">{r.target}</td>
                  <td className="p-2">{r.period || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
