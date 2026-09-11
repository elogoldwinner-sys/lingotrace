import type { PointsReason } from "../types";

/** Shown when awarding (amount > 0). "assignment" displays as "Dictation" — see i18n. */
export const POSITIVE_POINTS_REASONS: PointsReason[] = [
  "participation",
  "homework",
  "behavior",
  "attendance",
  "assignment",
  "manual",
  "other",
];

/** Shown when deducting (amount < 0). "custom" pairs with a free-text detail box. */
export const NEGATIVE_POINTS_REASONS: PointsReason[] = [
  "misbehavior",
  "sideTalkNoise",
  "nonParticipation",
  "missingHomework",
  "incompleteWork",
  "missingTools",
  "custom",
];

/** Picks the right reason list for the current amount's sign. */
export function reasonsForAmount(amount: number): PointsReason[] {
  return amount < 0 ? NEGATIVE_POINTS_REASONS : POSITIVE_POINTS_REASONS;
}
