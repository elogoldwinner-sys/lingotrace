import {
  BookCheck,
  Handshake,
  Star,
  Trophy,
  Crown,
  Flame,
  HeartHandshake,
  ShieldCheck,
  TrendingUp,
  Rocket,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type { PointsReason } from "../types";

/** Shown when awarding (amount > 0). "custom" pairs with a free-text detail box, same as on the deduct side. */
export const POSITIVE_POINTS_REASONS: PointsReason[] = [
  "homeworkMaster",
  "teamPlayer",
  "participationStar",
  "learningChampion",
  "classroomLeader",
  "effortHero",
  "classroomHelper",
  "responsibilityStar",
  "improvementHero",
  "superLearner",
  "custom",
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

/** Icon shown next to each positive reason's label in the award modal. Reasons not listed here (deduct reasons, legacy ones) render with no icon. */
export const POINTS_REASON_ICONS: Partial<Record<PointsReason, LucideIcon>> = {
  homeworkMaster: BookCheck,
  teamPlayer: Handshake,
  participationStar: Star,
  learningChampion: Trophy,
  classroomLeader: Crown,
  effortHero: Flame,
  classroomHelper: HeartHandshake,
  responsibilityStar: ShieldCheck,
  improvementHero: TrendingUp,
  superLearner: Rocket,
  custom: Pencil,
};
