import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { format } from "date-fns";
import Modal from "./Modal";
import { db } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { buildCsv, downloadTextFile } from "../../lib/csv";
import { toMillis } from "../../lib/timestamps";
import { NEGATIVE_POINTS_REASONS, POSITIVE_POINTS_REASONS } from "../../lib/pointsReasons";
import type { ClassRecord, PointsReason, PointsTransaction, StudentRecord } from "../../types";

type KindFilter = "both" | "positive" | "negative";

/** Reasons that only exist on old transactions — still reportable, listed under "Older reasons". */
const LEGACY_REASONS: PointsReason[] = [
  "participation",
  "homework",
  "behavior",
  "attendance",
  "assignment",
  "project",
  "manual",
  "other",
];

function today() {
  return format(new Date(), "yyyy-MM-dd");
}

/** The reasons offered for a given positive/negative/both choice, without duplicates ("custom" exists on both sides). */
function reasonsFor(kind: KindFilter): PointsReason[] {
  const list: PointsReason[] =
    kind === "positive"
      ? [...POSITIVE_POINTS_REASONS, ...LEGACY_REASONS]
      : kind === "negative"
        ? [...NEGATIVE_POINTS_REASONS]
        : [...POSITIVE_POINTS_REASONS, ...NEGATIVE_POINTS_REASONS, ...LEGACY_REASONS];
  return Array.from(new Set(list));
}

/**
 * Exports the teacher's own points history (awards and deductions) as a CSV
 * that opens in Excel. Filterable by date range, class (or all classes),
 * positive/negative/both, and any combination of reasons. Read-only: it
 * only reads `pointsTransactions` the teacher already owns.
 */
export default function PointsReportModal({
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
  const { user } = useAuth();

  const [startDate, setStartDate] = useState(() => format(new Date(Date.now() - 7 * 86400000), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(today);
  const [classId, setClassId] = useState<string>("all");
  const [kind, setKind] = useState<KindFilter>("both");
  const [selected, setSelected] = useState<Set<PointsReason>>(() => new Set(reasonsFor("both")));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Open on the class currently selected on the Students page.
  useEffect(() => {
    if (open) {
      setClassId(defaultClassId || "all");
      setMessage("");
    }
  }, [open, defaultClassId]);

  const visibleReasons = useMemo(() => reasonsFor(kind), [kind]);

  function changeKind(next: KindFilter) {
    setKind(next);
    setSelected(new Set(reasonsFor(next)));
  }

  function toggleReason(reason: PointsReason) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });
  }

  const allSelected = visibleReasons.every((r) => selected.has(r));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleReasons));
  }

  function reasonLabel(reason: PointsReason) {
    return t(`points.reasons.${reason}`);
  }

  async function handleExport() {
    if (!user) return;
    setMessage("");
    if (!startDate || !endDate || startDate > endDate) {
      setMessage(t("pointsReport.badRange"));
      return;
    }
    if (selected.size === 0) {
      setMessage(t("pointsReport.noReasons"));
      return;
    }
    setBusy(true);
    try {
      // Local-time day boundaries, so "today" means the teacher's today.
      const startMs = new Date(`${startDate}T00:00:00`).getTime();
      const endMs = new Date(`${endDate}T23:59:59.999`).getTime();

      const snap = await getDocs(query(collection(db, "pointsTransactions"), where("awardedBy", "==", user.uid)));
      const rows = snap.docs
        .map((d) => ({ ...(d.data() as PointsTransaction), id: d.id }))
        .filter((txn) => {
          if (classId !== "all" && txn.classId !== classId) return false;
          const created = toMillis(txn.createdAt);
          if (created < startMs || created > endMs) return false;
          if (kind === "positive" && !(txn.amount > 0)) return false;
          if (kind === "negative" && !(txn.amount < 0)) return false;
          return selected.has(txn.reason);
        })
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));

      if (rows.length === 0) {
        setMessage(t("pointsReport.empty"));
        return;
      }

      // Student names (and groups) for the classes that appear in the report.
      const classIds = Array.from(new Set(rows.map((r) => r.classId)));
      const studentsById = new Map<string, StudentRecord>();
      await Promise.all(
        classIds.map(async (cid) => {
          const s = await getDocs(query(collection(db, "students"), where("classId", "==", cid)));
          s.docs.forEach((d) => studentsById.set(d.id, { ...(d.data() as StudentRecord), id: d.id }));
        })
      );
      const classNameById = new Map(classes.map((c) => [c.id, c.name]));

      const headers = [
        t("pointsReport.colDate"),
        t("pointsReport.colClass"),
        t("pointsReport.colStudent"),
        t("pointsReport.colGroup"),
        t("pointsReport.colPoints"),
        t("pointsReport.colType"),
        t("pointsReport.colReason"),
        t("pointsReport.colDetail"),
      ];
      const body = rows.map((txn) => {
        const student = studentsById.get(txn.studentId);
        const created = toMillis(txn.createdAt);
        return [
          created ? format(new Date(created), "yyyy-MM-dd HH:mm") : "",
          classNameById.get(txn.classId) || "",
          student?.name || t("pointsReport.unknownStudent"),
          student?.group || "",
          String(txn.amount),
          txn.amount > 0 ? t("pointsReport.typePositive") : txn.amount < 0 ? t("pointsReport.typeNegative") : "",
          reasonLabel(txn.reason),
          txn.note || "",
        ];
      });

      const total = rows.reduce((sum, r) => sum + r.amount, 0);
      body.push(["", "", "", t("pointsReport.total"), String(total), "", "", ""]);

      const scope = classId === "all" ? "all-classes" : (classNameById.get(classId) || "class").replace(/[^\w؀-ۿ-]+/g, "_");
      downloadTextFile(`lingotrace-points-${scope}-${startDate}_to_${endDate}.csv`, buildCsv(headers, body));
      setMessage(t("pointsReport.done", { count: rows.length }));
    } catch (err) {
      console.error("Points report failed", err);
      setMessage(t("pointsReport.error"));
    } finally {
      setBusy(false);
    }
  }

  const kindOptions: { value: KindFilter; label: string }[] = [
    { value: "both", label: t("pointsReport.kindBoth") },
    { value: "positive", label: t("pointsReport.kindPositive") },
    { value: "negative", label: t("pointsReport.kindNegative") },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("pointsReport.title")} widthClassName="max-w-xl">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-cream-600">{t("pointsReport.intro")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-eyebrow mb-1 block">{t("pointsReport.from")}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-full" />
          </div>
          <div>
            <label className="label-eyebrow mb-1 block">{t("pointsReport.to")}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-full" />
          </div>
        </div>

        <div>
          <label className="label-eyebrow mb-1 block">{t("pointsReport.classLabel")}</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input-field w-full">
            <option value="all">{t("pointsReport.allClasses")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-eyebrow mb-1 block">{t("pointsReport.kindLabel")}</label>
          <div className="flex flex-wrap gap-2">
            {kindOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => changeKind(o.value)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  kind === o.value
                    ? "border-gold bg-gold text-white"
                    : "border-cream-400 bg-white text-navy hover:border-gold/60"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label-eyebrow">{t("pointsReport.reasonsLabel")}</label>
            <button onClick={toggleAll} className="text-xs font-semibold text-gold hover:underline">
              {allSelected ? t("pointsReport.clearAll") : t("pointsReport.selectAll")}
            </button>
          </div>
          <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-cream-400 p-2 sm:grid-cols-2">
            {visibleReasons.map((reason) => (
              <label key={reason} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-navy hover:bg-cream-300/40">
                <input type="checkbox" checked={selected.has(reason)} onChange={() => toggleReason(reason)} />
                {reasonLabel(reason)}
              </label>
            ))}
          </div>
        </div>

        {message && <p className="text-sm text-navy">{message}</p>}

        <button onClick={handleExport} disabled={busy} className="btn-primary py-2 text-sm disabled:opacity-60">
          <Download size={16} />
          {busy ? t("common.loading") : t("pointsReport.export")}
        </button>
      </div>
    </Modal>
  );
}
