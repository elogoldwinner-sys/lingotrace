import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RotateCcw, X } from "lucide-react";
import Modal from "./Modal";
import { useAuth } from "../../contexts/AuthContext";
import { useFeature } from "../../contexts/SchoolContext";
import { awardSheet } from "../../lib/services/pointsService";
import { BUILTIN_KINDS, assessmentNote, getAssessmentPrefs, kindLabel } from "../../lib/assessments";
import { studentDisplayName } from "../../lib/studentName";
import type { StudentRecord } from "../../types";

/** One column of the sheet: a single quiz / exam / spelling exam / project, with the name the teacher gave it. */
interface Column {
  id: string;
  /** "quiz" | "exam" | "spelling" | "project" | "custom" */
  kind: string;
  /** The teacher's own type name when kind is "custom". */
  label: string;
  name: string;
}

const MAX_TYPE_LENGTH = 40;
const MAX_NAME_LENGTH = 60;
const cellKey = (studentId: string, id: string) => `${studentId}\u0001${id}`;
let columnCounter = 0;

/**
 * Mark sheet for periodic entries: quizzes, exams, spelling exams and projects. The class is listed with an empty slot
 * per student for each assessment column; fill a column with one mark for everyone, adjust the students who differ,
 * and save. Empty slots are skipped. These marks add to the students' points and appear in their own "Assessments"
 * section of the reports, before the detailed points.
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
  const { user, profile, updateTeacherAssessmentKinds } = useAuth();
  // Removing / adding assessment types is part of "edit reasons", which the platform admin can switch off per school.
  const canEdit = useFeature("editReasons");
  const prefs = getAssessmentPrefs(profile);
  const [columns, setColumns] = useState<Column[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [fills, setFills] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState(false);
  const [ownText, setOwnText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

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

  const builtIn = BUILTIN_KINDS.filter((k) => !prefs.hidden.includes(k));
  const customTypes = canEdit ? prefs.custom : [];

  function addColumn(kind: string, label = "") {
    setColumns((prev) => [...prev, { id: `c${++columnCounter}`, kind, label, name: "" }]);
  }
  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
    setCells((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.endsWith(`\u0001${id}`))));
  }
  const setName = (id: string, name: string) => setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));

  async function savePrefs(next: { hidden: string[]; custom: string[] }) {
    try {
      await updateTeacherAssessmentKinds(next);
    } catch (err) {
      console.error("Could not save the assessment types", err);
    }
  }
  const hideBuiltIn = (k: string) => savePrefs({ ...prefs, hidden: [...prefs.hidden, k] });
  const removeCustom = (label: string) => savePrefs({ ...prefs, custom: prefs.custom.filter((c) => c !== label) });
  function addOwnType() {
    const text = ownText.trim();
    if (!text) return;
    if (!prefs.custom.some((c) => c.toLowerCase() === text.toLowerCase())) savePrefs({ ...prefs, custom: [...prefs.custom, text] });
    setOwnText("");
    setTyping(false);
  }

  /** Whole numbers only, like the normal award dialog. */
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

  const filled = useMemo(() => {
    const out: { studentId: string; col: Column; amount: number }[] = [];
    rows.forEach((s) =>
      columns.forEach((c) => {
        const raw = cells[cellKey(s.id, c.id)];
        const n = raw ? parseInt(raw, 10) : 0;
        if (n > 0) out.push({ studentId: s.id, col: c, amount: n });
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
          marks: list.map((f) => ({
            amount: f.amount,
            // Stored as a custom-reason mark whose note reads "Quiz: Fractions", so every older screen still shows it well;
            // the assessment fields are what the reports use to list it in their Assessments section.
            reason: "custom" as const,
            note: assessmentNote(t, f.col.kind, f.col.label, f.col.name),
            assessment: { kind: f.col.kind, label: f.col.kind === "custom" ? f.col.label : undefined, name: f.col.name.trim() },
          })),
        };
      });
      const { saved, failed } = await awardSheet(classId, user.uid, entries);
      const savedSet = new Set(saved);
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

  const chip = "inline-flex items-center gap-1.5 rounded-full border border-green-600 bg-white px-3 py-1.5 text-sm font-semibold text-green-700 transition hover:bg-green-600 hover:text-white";
  const typeChip = (label: string, onAdd: () => void, onRemove?: () => void) => (
    <span key={label} className="inline-flex items-center">
      <button type="button" onClick={onAdd} className={`${chip} ${onRemove ? "rounded-e-none border-e-0" : ""}`}>
        <Plus size={14} />
        {label}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("msheet.removeType", "Remove this type")}
          title={t("msheet.removeType", "Remove this type")}
          className="rounded-e-full border border-green-600 bg-white px-2 py-2 text-cream-600 hover:bg-red-50 hover:text-red-600"
        >
          <X size={13} />
        </button>
      )}
    </span>
  );

  return (
    <Modal open={open} onClose={onClose} title={`${t("msheet.title", "Mark sheet")}${className ? ` — ${className}` : ""}`} widthClassName="max-w-5xl">
      <div className="space-y-4">
        <p className="text-sm text-cream-600">
          {t(
            "msheet.intro2",
            "Add a column for each quiz, exam, spelling exam or project and name it. Fill a column with one mark for everyone, then change only the students who differ. Empty slots are skipped. These marks appear in their own section of the reports, before the detailed points."
          )}
        </p>

        <div className="space-y-3 rounded-xl border border-cream-400 bg-cream-100/60 p-3">
          <p className="label-eyebrow">{t("msheet.addColumnFor", "Add a column for")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {builtIn.map((k) => typeChip(kindLabel(t, k), () => addColumn(k), canEdit ? () => hideBuiltIn(k) : undefined))}
            {customTypes.map((label) => typeChip(label, () => addColumn("custom", label), () => removeCustom(label)))}
            {canEdit &&
              (typing ? (
                <span className="inline-flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    maxLength={MAX_TYPE_LENGTH}
                    value={ownText}
                    onChange={(e) => setOwnText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addOwnType()}
                    placeholder={t("msheet.ownTypePh", "Type name (e.g. Oral test)")}
                    className="input-field w-auto min-w-[12rem]"
                  />
                  <button type="button" onClick={addOwnType} disabled={!ownText.trim()} className="btn-secondary py-1.5 text-sm disabled:opacity-60">
                    {t("msheet.addType", "Add type")}
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setTyping(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline">
                  <Plus size={14} />
                  {t("points.addOwnReason")}
                </button>
              ))}
            {canEdit && prefs.hidden.length > 0 && (
              <button type="button" onClick={() => savePrefs({ ...prefs, hidden: [] })} className="inline-flex items-center gap-1 text-xs font-semibold text-cream-600 hover:text-navy">
                <RotateCcw size={12} />
                {t("msheet.restoreTypes", "Restore the default types")}
              </button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-cream-600">{t("msheet.noStudents", "This class has no students yet.")}</p>
        ) : columns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-cream-400 px-3 py-6 text-center text-sm text-cream-600">
            {t("msheet.pickFirst2", "Add a column above to start (for example a quiz).")}
          </p>
        ) : (
          <div ref={gridRef} className="max-h-[55vh] overflow-auto rounded-xl border border-cream-400">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-cream-100">
                <tr>
                  <th className="sticky start-0 z-20 min-w-[10rem] bg-cream-100 px-3 py-2 text-start font-bold text-navy">{t("msheet.student", "Student")}</th>
                  {columns.map((c) => (
                    <th key={c.id} className="min-w-[11rem] px-2 py-2 align-top">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-start font-bold text-green-700">{kindLabel(t, c.kind, c.label)}</span>
                        <button type="button" onClick={() => removeColumn(c.id)} aria-label={t("common.remove", "Remove")} className="text-cream-600 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                      <input
                        value={c.name}
                        maxLength={MAX_NAME_LENGTH}
                        onChange={(e) => setName(c.id, e.target.value)}
                        placeholder={t("msheet.namePh", "Name (e.g. Quiz 3 – Fractions)")}
                        className="input-field mt-1 w-full px-2 py-1 text-xs font-normal"
                      />
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
                      <td className={`px-2 py-1 text-center font-bold ${total > 0 ? "text-green-700" : "text-cream-500"}`}>{total > 0 ? `+${total}` : "–"}</td>
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
            <button type="button" onClick={save} disabled={saving || filled.length === 0} className="btn-primary disabled:opacity-60">
              {saving ? t("common.loading") : t("msheet.save", { defaultValue: "Save {{count}} marks", count: filled.length })}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
