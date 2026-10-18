import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, Download } from "lucide-react";
import { subscribeToStudentCertificates, toRenderData } from "../../lib/services/certificatesService";
import { downloadCertificates } from "../../lib/certificate";
import { formatNoteDate } from "../../lib/timestamps";
import type { CertificateRecord } from "../../types";

/**
 * The certificates a teacher issued to this student, with a one-click PDF
 * download (A4, print-ready). Renders nothing until there is one.
 * `kid` switches to the playful portal styling.
 */
export default function CertificatesSection({ studentId, kid = false }: { studentId: string; kid?: boolean }) {
  const { t, i18n } = useTranslation();
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setCertificates([]);
    return subscribeToStudentCertificates(studentId, setCertificates, (e) =>
      console.error("Failed to load certificates for", studentId, e)
    );
  }, [studentId]);

  if (certificates.length === 0) return null;

  async function handleDownload(c: CertificateRecord) {
    setBusyId(c.id);
    setError("");
    try {
      await downloadCertificates([toRenderData(c)]);
    } catch (err) {
      console.error("Certificate download failed", err);
      setError(t("certificate.downloadError"));
    } finally {
      setBusyId("");
    }
  }

  const cardCls = kid
    ? "relative overflow-hidden rounded-[1.75rem] border border-white bg-white/95 p-6 shadow-[0_18px_34px_-24px_rgba(90,60,200,0.45)]"
    : "card p-6";
  const itemCls = kid
    ? "flex items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3"
    : "flex items-center justify-between gap-3 rounded-lg border border-cream-400 bg-cream-100 px-4 py-3";
  const btnCls = kid
    ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy-600 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-navy-700 disabled:opacity-60"
    : "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-navy px-4 py-1.5 text-sm font-semibold text-cream-100 hover:bg-navy-700 disabled:opacity-60";

  return (
    <div className={cardCls}>
      {kid ? (
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-50 text-navy-600">
            <Award size={18} />
          </span>
          <h2 className="text-lg font-extrabold text-navy-700">{t("certificate.portalTitle")}</h2>
        </div>
      ) : (
        <h2 className="mb-3 text-lg font-semibold text-navy">{t("certificate.portalTitle")}</h2>
      )}
      <div className="flex flex-col gap-2.5">
        {certificates.map((c) => (
          <div key={c.id} className={itemCls}>
            <div className="min-w-0">
              <p className={kid ? "text-sm font-bold text-navy-700" : "font-semibold text-navy"}>
                {t("certificate.name")}
              </p>
              <p className="line-clamp-2 text-sm text-cream-600">{c.reason}</p>
              {formatNoteDate(c.createdAt, i18n.language) && (
                <p className="mt-0.5 text-xs text-cream-600/80">{formatNoteDate(c.createdAt, i18n.language)}</p>
              )}
            </div>
            <button onClick={() => handleDownload(c)} disabled={busyId === c.id} className={btnCls}>
              <Download size={14} />
              {busyId === c.id ? t("common.loading") : t("certificate.download")}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
