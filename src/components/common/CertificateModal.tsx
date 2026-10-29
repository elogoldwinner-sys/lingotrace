import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, Download, Send, Trash2 } from "lucide-react";
import Modal from "./Modal";
import {
  computeCertificateStats,
  deleteCertificate,
  issueCertificates,
  subscribeToIssuedCertificates,
  toRenderData,
} from "../../lib/services/certificatesService";
import { downloadCertificates } from "../../lib/certificate";
import { useAuth } from "../../contexts/AuthContext";
import { formatNoteDate } from "../../lib/timestamps";
import type { CertificateRecord, StudentRecord } from "../../types";

const MAX_REASON = 180;

/**
 * Teacher side of certificates: type the reason once, then either send the
 * certificate to the selected students' parent portals or download it as an
 * A4 PDF (one file named after the student; several students → one zip of them).
 * Name, points, badges and class position fill themselves in.
 */
export default function CertificateModal({
  open,
  onClose,
  selected,
  roster,
  classId,
  className,
  teacherId,
}: {
  open: boolean;
  onClose: () => void;
  /** The students the certificate is for. */
  selected: StudentRecord[];
  /** Everyone in the class (the class position is measured against all of them). */
  roster: StudentRecord[];
  classId: string;
  className: string;
  teacherId: string;
}) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"" | "issue" | "download">("");
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [issued, setIssued] = useState<CertificateRecord[]>([]);

  useEffect(() => {
    if (!open || !classId || !teacherId) return;
    return subscribeToIssuedCertificates(classId, teacherId, setIssued, (e) =>
      console.error("Failed to load issued certificates", e)
    );
  }, [open, classId, teacherId]);

  useEffect(() => {
    if (open) setMessage(null);
  }, [open]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const recent = issued.filter((c) => selectedIds.has(c.studentId)).slice(0, 5);
  const canAct = reason.trim().length > 0 && selected.length > 0 && !busy;

  async function prepare() {
    const stats = await computeCertificateStats(classId, teacherId, roster, selected);
    return selected.map((s) => {
      const st = stats.get(s.id)!;
      return {
        studentId: s.id,
        classId,
        studentName: s.name,
        reason: reason.trim(),
        points: st.points,
        rank: st.rank,
        classSize: st.classSize,
        badgeIds: st.badgeIds,
        issuedBy: teacherId,
      };
    });
  }

  async function handleIssue() {
    if (!canAct) return;
    setBusy("issue");
    setMessage(null);
    try {
      const records = await prepare();
      await issueCertificates(records);
      setMessage({ kind: "ok", text: t("certificate.issued", { count: records.length }) });
    } catch (err) {
      console.error("Issuing certificates failed", err);
      setMessage({ kind: "error", text: t("certificate.issueError") });
    } finally {
      setBusy("");
    }
  }

  async function handleDownload() {
    if (!canAct) return;
    setBusy("download");
    setMessage(null);
    try {
      const records = await prepare();
      await downloadCertificates(
        records.map((r) => toRenderData(r, profile?.schoolLogoURL)),
        t("certificate.zipName", { className }),
        (done, total) => setProgress(total > 1 ? t("certificate.preparing", { done, total }) : "")
      );
      setMessage({ kind: "ok", text: t("certificate.downloaded", { count: records.length }) });
    } catch (err) {
      console.error("Certificate download failed", err);
      setMessage({ kind: "error", text: t("certificate.downloadError") });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("certificate.modalTitle")}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1 text-sm font-semibold text-navy">
            {t("certificate.recipients", { count: selected.length })}
          </p>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {selected.map((s) => (
              <span key={s.id} className="rounded-full border border-gold/40 bg-gold-50 px-2.5 py-0.5 text-xs text-navy">
                {s.name}
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-navy">{t("certificate.reasonLabel")}</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
            rows={4}
            placeholder={t("certificate.reasonPlaceholder")}
            className="w-full rounded-lg border border-cream-400 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-end text-xs text-cream-600">
            {reason.length}/{MAX_REASON}
          </p>
          <p className="text-xs text-cream-600">{t("certificate.autoFill")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={handleIssue} disabled={!canAct} className="btn-gold inline-flex items-center gap-1.5 disabled:opacity-50">
            <Send size={15} />
            {busy === "issue" ? t("common.loading") : t("certificate.sendToPortal")}
          </button>
          <button
            onClick={handleDownload}
            disabled={!canAct}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-cream-100 hover:bg-navy-700 disabled:opacity-50"
          >
            <Download size={15} />
            {busy === "download" ? progress || t("common.loading") : t("certificate.downloadPdf")}
          </button>
        </div>

        {message && (
          <p className={`text-sm ${message.kind === "ok" ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
        )}

        {recent.length > 0 && (
          <div className="border-t border-cream-300 pt-3">
            <p className="mb-2 text-sm font-semibold text-navy">{t("certificate.recentlyIssued")}</p>
            <div className="flex flex-col gap-1.5">
              {recent.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-cream-400 px-3 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold text-navy">
                      <Award size={13} className="shrink-0 text-gold" />
                      <span className="truncate">{c.studentName}</span>
                      <span className="text-xs font-normal text-cream-600">
                        {formatNoteDate(c.createdAt, i18n.language)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-cream-600">{c.reason}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(t("certificate.confirmRemove"))) deleteCertificate(c.id);
                    }}
                    title={t("certificate.removeFromPortal")}
                    className="shrink-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
