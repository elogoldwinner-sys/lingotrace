import type { PointsReason, ReasonList, ReasonPrefs, ReasonScope, UserProfile } from "../types";
import { reasonsForAmount } from "./pointsReasons";

export const emptyList = (): ReasonList => ({ hidden: [], custom: [] });
export const emptyScope = (): ReasonScope => ({ positive: emptyList(), negative: emptyList() });

export function cloneScope(scope: ReasonScope): ReasonScope {
  return {
    positive: { hidden: [...scope.positive.hidden], custom: [...scope.positive.custom] },
    negative: { hidden: [...scope.negative.hidden], custom: [...scope.negative.custom] },
  };
}

/** The teacher's preferences, falling back to the older single "saved reasons" list when nothing new is stored. */
export function getPrefs(profile: UserProfile | null | undefined): ReasonPrefs {
  if (profile?.reasonPrefs) return profile.reasonPrefs;
  const legacy = profile?.customReasons;
  const all = emptyScope();
  if (legacy) {
    all.positive.custom = [...(legacy.positive || [])];
    all.negative.custom = [...(legacy.negative || [])];
  }
  return { all };
}

/** True when the class has its own list (otherwise it follows "All classes"). */
export function hasClassOverride(prefs: ReasonPrefs, classId: string): boolean {
  return !!classId && !!prefs.byClass?.[classId];
}

/** The scope in effect for a class: its own list if it has one, otherwise the all-classes list. */
export function effectiveScope(prefs: ReasonPrefs, classId: string): ReasonScope {
  return (classId && prefs.byClass?.[classId]) || prefs.all;
}

/** Built-in reasons offered for this direction, minus the ones the teacher switched off ("custom" is handled separately). */
export function visibleBuiltIn(positive: boolean, scope: ReasonScope): PointsReason[] {
  const hidden = (positive ? scope.positive : scope.negative).hidden;
  return reasonsForAmount(positive ? 1 : -1).filter((r) => r !== "custom" && !hidden.includes(r));
}

/** Every built-in reason for a direction, for the preferences screen. */
export function allBuiltIn(positive: boolean): PointsReason[] {
  return reasonsForAmount(positive ? 1 : -1).filter((r) => r !== "custom");
}
