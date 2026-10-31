import { useTranslation } from "react-i18next";
import { GRADES } from "../../lib/school/scope";

export interface Scope {
  allClasses: boolean;
  grades: number[];
  classKeys: string[];
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
    active ? "border-gold bg-gold text-white" : "border-cream-400 bg-white text-navy hover:border-gold/60"
  }`;

/** Tap-to-choose scope: everything, whole grades, and / or individual classes (5-A, 5-B …). */
export default function ScopePicker({
  value,
  onChange,
  classKeys,
  allLabel,
}: {
  value: Scope;
  onChange: (s: Scope) => void;
  /** Class keys that currently exist and may be picked individually. */
  classKeys: string[];
  allLabel: string;
}) {
  const { t } = useTranslation();
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  return (
    <div className="space-y-3">
      <button type="button" className={chip(value.allClasses)} onClick={() => onChange({ ...value, allClasses: !value.allClasses })}>
        {allLabel}
      </button>
      {!value.allClasses && (
        <>
          <div>
            <p className="label-eyebrow mb-1.5">{t("sp.wholeGrades", "Entire grades")}</p>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g) => (
                <button key={g} type="button" className={chip(value.grades.includes(g))} onClick={() => onChange({ ...value, grades: toggle(value.grades, g) })}>
                  {t("sp.gradeN", { defaultValue: "Grade {{n}}", n: g })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label-eyebrow mb-1.5">{t("sp.specificClasses", "Specific classes")}</p>
            {classKeys.length === 0 ? (
              <p className="text-xs text-cream-600">{t("sp.noClassKeys", "Classes appear here once teachers have set their grade and section.")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {classKeys.map((k) => (
                  <button key={k} type="button" className={chip(value.classKeys.includes(k))} onClick={() => onChange({ ...value, classKeys: toggle(value.classKeys, k) })}>
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function scopeSummary(a: { allClasses?: boolean; grades?: number[]; classKeys?: string[] }, t: (k: string, d: string) => string): string {
  if (a.allClasses) return t("sp.scopeAll", "All classes");
  const parts = [
    ...(a.grades || []).slice().sort((x, y) => x - y).map((g) => `${t("sp.grade", "Grade")} ${g}`),
    ...(a.classKeys || []),
  ];
  return parts.length ? parts.join(" · ") : t("sp.scopeNone", "No classes assigned yet");
}
