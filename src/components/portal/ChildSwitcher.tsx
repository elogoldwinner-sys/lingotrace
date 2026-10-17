import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeToStudent } from "../../lib/services/studentsService";
import type { StudentRecord } from "../../types";

type Variant = "classic" | "kid";

interface ChildGroup {
  key: string;
  name: string;
  records: StudentRecord[];
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Two-level selector for the parent portal. A parent account can hold many
 * student records — one per child per subject — so a flat row of tabs gets
 * long and repetitive. Instead: the top row has one chip per CHILD (records
 * with the same name are the same child in different subjects), and when the
 * selected child has more than one subject, a second row lets the parent
 * switch subject. Each chip row scrolls sideways rather than wrapping, so it
 * stays compact with many children. Renders nothing for a single child with
 * a single record.
 */
export default function ChildSwitcher({
  studentIds,
  currentStudentId,
  onSelect,
  onRemoved,
  variant,
  bar = false,
}: {
  studentIds: string[];
  currentStudentId: string;
  onSelect: (studentId: string) => void;
  onRemoved: (studentId: string) => void;
  variant: Variant;
  /** Wrap in a full-width, opaque bar (for use inside a sticky header) instead of a bare block. */
  bar?: boolean;
}) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<Record<string, StudentRecord>>({});
  // Remembers which subject was last open for each child, so switching away and back keeps it.
  const lastSubjectRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const unsubs = studentIds.map((sid) =>
      subscribeToStudent(sid, (data) => {
        if (data === null) {
          onRemoved(sid);
          setRecords((prev) => {
            const { [sid]: _gone, ...rest } = prev;
            return rest;
          });
        } else {
          setRecords((prev) => ({ ...prev, [sid]: data }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentIds.join(",")]);

  const groups = useMemo(() => {
    const map = new Map<string, ChildGroup>();
    for (const sid of studentIds) {
      const rec = records[sid];
      if (!rec) continue;
      const key = nameKey(rec.name);
      const group = map.get(key);
      if (group) group.records.push(rec);
      else map.set(key, { key, name: rec.name, records: [rec] });
    }
    map.forEach((g) =>
      g.records.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
    );
    return Array.from(map.values());
  }, [studentIds, records]);

  const activeGroup = groups.find((g) => g.records.some((r) => r.id === currentStudentId));
  if (activeGroup) lastSubjectRef.current[activeGroup.key] = currentStudentId;

  if (groups.length === 0) return null;
  if (groups.length === 1 && groups[0].records.length === 1) return null;

  const childChip = (active: boolean) =>
    variant === "kid"
      ? `shrink-0 rounded-full border-2 px-4 py-2 text-sm font-extrabold transition ${
          active
            ? "border-gold-300 bg-gold-50 text-navy-700"
            : "border-navy-100 bg-white/80 text-navy-500 hover:border-gold-200"
        }`
      : `shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
          active
            ? "border-gold bg-gold-50 text-navy"
            : "border-cream-300 bg-white text-cream-600 hover:border-gold/50"
        }`;

  const subjectChip = (active: boolean) =>
    variant === "kid"
      ? `shrink-0 rounded-full px-3 py-1 text-xs font-extrabold transition ${
          active ? "bg-navy-600 text-white" : "bg-white/80 text-navy-500 hover:bg-gold-50"
        }`
      : `shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
          active ? "bg-navy text-cream-100" : "bg-cream-200 text-navy/70 hover:bg-cream-300"
        }`;

  const content = (
    <div className="space-y-2">
      {groups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {groups.map((g) => {
            const active = g === activeGroup;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => onSelect(lastSubjectRef.current[g.key] || g.records[0].id)}
                className={childChip(active)}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}
      {activeGroup && activeGroup.records.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 text-xs font-semibold text-cream-600">{t("portal.subjectsLabel")}</span>
          {activeGroup.records.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={subjectChip(r.id === currentStudentId)}
            >
              {r.subject || t("portal.generalSubject")}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!bar) return content;
  return (
    <div
      className={
        variant === "kid"
          ? "bg-white/30 shadow-[0_8px_16px_-12px_rgba(90,60,200,0.35)] backdrop-blur-xl"
          : "border-b border-cream-400 bg-cream-100/95 backdrop-blur"
      }
    >
      <div className={`mx-auto px-4 py-2 ${variant === "kid" ? "max-w-2xl sm:px-6" : "max-w-3xl"}`}>{content}</div>
    </div>
  );
}
