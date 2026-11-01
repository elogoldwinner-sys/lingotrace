import type { TFunction } from "i18next";
import type { UserProfile } from "../types";

/** The assessment types of the mark sheet. Teachers can hide these and add their own (see AssessmentPrefs). */
export const BUILTIN_KINDS = ["quiz", "exam", "spelling", "project"] as const;

export const BUILTIN_LABELS: Record<(typeof BUILTIN_KINDS)[number], string> = {
  quiz: "Quiz",
  exam: "Exam",
  spelling: "Spelling exam",
  project: "Project",
};

/** Which assessment types a teacher sees on the mark sheet: built-in ones they removed + their own added ones. */
export interface AssessmentPrefs {
  hidden: string[];
  custom: string[];
}

export function getAssessmentPrefs(profile: UserProfile | null | undefined): AssessmentPrefs {
  const p = profile?.assessmentKinds;
  return { hidden: Array.isArray(p?.hidden) ? p!.hidden : [], custom: Array.isArray(p?.custom) ? p!.custom : [] };
}

/** What an assessment is called in reports: the built-in type's translation, or the teacher's own type name. */
export function kindLabel(t: TFunction, kind: string, label?: string): string {
  if (kind === "custom") return label || t("assess.other", "Assessment");
  return t(`assess.kinds.${kind}`, (BUILTIN_LABELS as Record<string, string>)[kind] || kind);
}

/** The text stored in the mark's note, so older screens (history, parent portal) still show something readable. */
export function assessmentNote(t: TFunction, kind: string, label: string | undefined, name: string): string {
  const type = kindLabel(t, kind, label);
  return name.trim() ? `${type}: ${name.trim()}` : type;
}
