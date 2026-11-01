import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import Modal from "./Modal";
import { useAuth } from "../../contexts/AuthContext";
import { useFeature } from "../../contexts/SchoolContext";
import { awardSheet } from "../../lib/services/pointsService";
import { effectiveScope, emptyScope, getPrefs, visibleBuiltIn } from "../../lib/reasonPrefs";
import { studentDisplayName } from "../../lib/studentName";
import type { PointsReason, StudentRecord } from "../../types";

interface Column {
  id: string;
  reason: PointsReason;
  note: string;
  /** 1 = gained, -1 = deducted. Teachers type plain numbers; deductions are stored as negatives. */
  sign: 1 | -1;
}

const colId = (sign: 1 | -1, reason: PointsReason, note: string) => `${sign}|${reason}|${note}`;
const MAX_CUSTOM_LENGTH = 60;
const cellKey = (studentId: string, id: string) => `${studentId}\u0001${id}`;

/**
 * Mark sheet: the class as a list with one empty slot per student for each chosen reason (quiz, exam, dictation…).
 * Fill a whole column with one mark in a click, then adjust the students who differ, and save everything at once.
 * Empty slots are skipped. Deduction columns take plain numbers and are saved as deductions.
 */
export default function MarkSheetModal({
  open,
  onClose,
  classId,
  className,
  students,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  students: StudentRecord[];
}) {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const canEditReasons = useFeature("editReasons");
  const [columns, setColumns] = useState<Column[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [fills, setFills] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState(false);
  const [ownText, setOwnText] = useState("");
  const [ownSign, setOwnSign] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  // Start fresh whenever the sheet is opened or the class changes.
  useEffect(() => {
    if (!open) return;
    setColumns([]);
    setCells({});
    setFills({});
    setTyping(false);
    setOwnText("");
    setMessage("");
  }, [open, classId]);

  const rows = useMemo(
    () => [...students].sort((a, b) => studentDisplayName(a, i18n.language).localeCompare(studentDisplayName(b, i18n.language))),
    [students, i18n.language]
  );

  // Same reason lists as the normal Award dialog (the school's plan decides whether the teacher's own list applies).
  const scope = canEditReasons ? effectiveScope(getPrefs(profile), classId) : emptyScope();
  const gain = visibleBuiltIn(true, scope);
  const lose = visibleBuiltIn(false, scope);
  const savedGain = scope.positive.custom;
  const savedLose = scope.negative.custom;

  const has = (id: string) => columns.some((c) => c.id === id);
  function toggleColumn(sign: 1 | -1, reason: PointsReason, note = "") {
    const id = colId(sign, reason, note);
    if (has(id)) {
      setColumns((prev) => prev.filter((c) => c.id !== id));
      setCells((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.endsWith(`\u0001${id}`))));
    } else {
      setColumns((prev) => [...prev, { id, reason, note, sign }]);
    }
  }
  function addOwn() {
    const text = ownText.trim();
    if (!text) return;
    if (!has(colId(ownSign, "custom", text))) setColumns((prev) => [...prev, { id: colId(ownSign, "custom", text), reason: "custom", note: text, sign: ownSign }]);
    setOwnText("");
    setTyping(false);
  }

  const colLabel = (c: Column) => (c.reason === "custom" ? c.note : t(`points.reasons.${c.reason}`));

  /** Whole numbers only, like the normal award dialog: keep digits. */
  const clean = (v: string) => v.replace(/[^\d]/g, "").slice(0, 4);

  function fillColumn(id: string) {
    const v = clean(fills[id] || "");
    if (!v) return;
    setCells((prev) => {
      const next = { ...prev };
      rows.forEach((s) => (next[cellKey(s.id, id)] = v));
      return next;
    });
  }
  function clearColumn(id: string) {
    setCells((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.endsWith(`\u0001${id}`))));
  }

  function moveFocus(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    const delta = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${r + delta}-${c}"]`);
    el?.focus();
    el?.select();
  }

  const colById = new Map(columns.map((c) => [c.id, c]));
  const filled = useMemo(() => {
    const out: { studentId: string; col: Column; amount: number }[] = [];
    rows.forEach((s) =>
      columns.forEach((c) => {
        const raw = cells[cellKey(s.id, c.id)];
        const n = raw ? parseInt(raw, 10) : 0;
        if (n > 0) out.push({ studentId: s.id, col: c, amount: n * c.sign });
      })
    );
    return out;
  }, [rows, columns, cells]);

  const rowTotal = (studentId: string) => filled.filter((f) => f.studentId === studentId).reduce((sum, f) => sum + f.amount, 0);
  const studentCount = new Set(filled.map((f) => f.studentId)).size;

  async function save() {
    if (!user || filled.length === 0 || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const byStudent = new Map<string, typeof filled>();
      filled.forEach((f) => byStudent.set(f.studentId, [...(byStudent.get(f.studentId) || []), f]));
      const entries = Array.from(byStudent.entries()).map(([studentId, list]) => {
        const st = students.find((x) => x.id === studentId)!;
        return {
          studentId,
          currentPoints: st.points || 0,
          badgeIds: st.badgeIds || [],
          marks: list.map((f) => ({ amount: f.amount, reason: f.col.reason, note: f.col.reason === "custom" ? f.col.note : undefined })),
        };
      });
      const { saved, failed } = await awardSheet(classId, user.uid, entries);
      const savedSet = new Set(saved);
      // Clear the saved students' slots; anything that failed stays so it can be retried.
      setCells((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !savedSet.has(k.split("\u0001")[0]))));
      const markCount = filled.filter((f) => savedSet.has(f.studentId)).length;
      setMessage(
        failed.length === 0
          ? t("msheet.saved", { defaultValue: "Saved {{count}} marks for {{students}} students.", count: markCount, students: saved.length })
          : t("msheet.partial", {
              defaultValue: "Saved {{count}} marks. {{failed}} students could not be saved — their slots are kept, press Save again.",
              count: markCount,
              failed: failed.length,
            })
      );
    } catch (err) {
      console.error("Mark sheet failed", err);
      setMessage(t("msheet.error", "Couldn't save the marks. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  const chip = (active: boolean, tone: "gain" | "lose") =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
      active
        ? tone === "gain"
          ? "border-green-600 bg-green-600 text-white"
          : "border-red-600 bg-red-600 text-white"
        : "border-cream-400 bg-white text-navy hover:border-gold/60"
    }`;

  const group = (title: string, sign: 1 | -1, built: PointsReason[], custom: string[]) => (
    <div>
      <p className="label-eyebrow mb-1">{title}</p>
      <div className="flex flex-wrap gap-2">
        {built.map((r) => (
          <button key={r} type="button" onClick={() => toggleColumn(sign, r)} className={chip(has(colId(sign, r, "")), sign === 1 ? "gain" : "lose")}>
            {t(`points.reasons.${r}`)}
          </button>
        ))}
        {custom.map((text) => (
          <button key={text} type="button" onClick={() => toggleColumn(sign, "custom", text)} className={chip(has(colId(sign, "custom", text)), sign === 1 ? "gain" : "lose")}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={`${t("msheet.title", "Mark sheet")}${className ? ` — ${className}` : ""}`} widthClassName="max-w-5xl">
      <div className="space-y-4">
        <p className="text-sm text-cream-600">
          {t(
            "msheet.intro",
            "Pick the reasons you want as columns (a quiz, an exam, a dictation…). Fill a column with one mark for everyone, then change only the students who differ. Empty slots are skipped."
          )}
        </p>

        <div className="space-y-3 rounded-xl border border-cream-400 bg-cream-100/60 p-3">
          {group(t("msheet.gain", "Give marks for"), 1, gain, savedGain)}
          {group(t("msheet.lose", "Deduct marks for"), -1, lose, savedLose)}
          {canEditReasons &&
            (typing ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  maxLength={MAX_CUSTOM_LENGTH}
                  value={ownText}
                  onChange={(e) => setOwnText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addOwn()}
                  placeholder={t("points.ownReasonPlaceholder")}
                  className="input-field w-auto min-w-[12rem] flex-1"
                />
                <div className="flex overflow-hidden rounded-lg border border-cream-400 text-sm font-bold">
                  <button type="button" onClick={() => setOwnSign(1)} className={`px-3 py-1.5 ${ownSign === 1 ? "bg-green-600 text-white" : "bg-white text-navy"}`}>
                    +
                  </button>
                  <button type="button" onClick={() => setOwnSign(-1)} className={`px-3 py-1.5 ${ownSign === -1 ? "bg-red-600 text-white" : "bg-white text-navy"}`}>
                    −
                  </button>
                </div>
                <button type="button" onClick={addOwn} disabled={!ownText.trim()} className="btn-secondary py-1.5 text-sm disabled:opacity-60">
                  {t("msheet.addColumn", "Add column")}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setTyping(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline">
                <Plus size={14} />
                {t("points.addOwnReason")}
              </button>
            ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-cream-600">{t("msheet.noStudents", "This class has no students yet.")}</p>
        ) : columns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-cream-400 px-3 py-6 text-center text-sm text-cream-600">
            {t("msheet.pickFirst", "Choose at least one reason above to start.")}
          </p>
        ) : (
          <div ref={gridRef} className="max-h-[55vh] overflow-auto rounded-xl border border-cream-400">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-cream-100">
                <tr>
                  <th className="sticky start-0 z-20 min-w-[10rem] bg-cream-100 px-3 py-2 text-start font-bold text-navy">{t("msheet.student", "Student")}</th>
                  {columns.map((c) => (
                    <th key={c.id} className="min-w-[8.5rem] px-2 py-2 align-top">
                      <div className="flex items-start justify-between gap-1">
                        <span className={`text-start font-bold ${c.sign === 1 ? "text-green-700" : "text-red-700"}`}>
                          {c.sign === 1 ? "+" : "−"} {colLabel(c)}
                        </span>
                        <button type="button" onClick={() => toggleColumn(c.sign, c.reason, c.note)} aria-label={t("common.remove", "Remove")} className="text-cream-600 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          inputMode="numeric"
                          value={fills[c.id] || ""}
                          onChange={(e) => setFills((p) => ({ ...p, [c.id]: clean(e.target.value) }))}
                          onKeyDown={(e) => e.key === "Enter" && fillColumn(c.id)}
                          placeholder={t("msheet.markPh", "Mark")}
                          className="input-field w-14 px-2 py-1 text-center"
                        />
                        <button type="button" onClick={() => fillColumn(c.id)} disabled={!fills[c.id]} className="rounded-md bg-navy px-2 py-1 text-xs font-bold text-white disabled:opacity-40">
                          {t("msheet.fillAll", "Fill all")}
                        </button>
                        <button type="button" onClick={() => clearColumn(c.id)} className="text-xs font-semibold text-cream-600 hover:text-red-600">
                          {t("msheet.clear", "Clear")}
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="min-w-[4.5rem] px-2 py-2 text-center font-bold text-navy">{t("msheet.total", "Total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, r) => {
                  const total = rowTotal(s.id);
                  return (
                    <tr key={s.id} className="border-t border-cream-300 hover:bg-cream-50">
                      <td className="sticky start-0 bg-white px-3 py-1.5 font-semibold text-navy">{studentDisplayName(s, i18n.language)}</td>
                      {columns.map((c, ci) => (
                        <td key={c.id} className="px-2 py-1 text-center">
                          <input
                            data-cell={`${r}-${ci}`}
                            inputMode="numeric"
                            value={cells[cellKey(s.id, c.id)] || ""}
                            onChange={(e) => setCells((p) => ({ ...p, [cellKey(s.id, c.id)]: clean(e.target.value) }))}
                            onKeyDown={(e) => moveFocus(e, r, ci)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="input-field w-16 px-2 py-1 text-center"
                          />
                        </td>
                      ))}
                      <td className={`px-2 py-1 text-center font-bold ${total > 0 ? "text-green-700" : total < 0 ? "text-red-700" : "text-cream-500"}`}>
                        {total > 0 ? `+${total}` : total || "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {message && <p className="text-sm font-semibold text-navy">{message}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-cream-600">
            {filled.length > 0
              ? t("msheet.summary", { defaultValue: "{{count}} marks for {{students}} students are ready to save.", count: filled.length, students: studentCount })
              : t("msheet.nothing", "Nothing to save yet.")}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t("common.close", "Close")}
            </button>
            <button type="button" onClick={save} disabled={saving || filled.length === 0 || !colById.size} className="btn-primary disabled:opacity-60">
              {saving ? t("common.loading") : t("msheet.save", { defaultValue: "Save {{count}} marks", count: filled.length })}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
