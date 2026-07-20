import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import type { BadgeDefinition } from "../../types";

/**
 * Badge catalog. These are point-threshold badges by default; new badge types
 * (e.g. attendance streaks) plug into the same `criteria` shape and the same
 * evaluate function below.
 */
export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: "first-steps",
    name: "First Steps",
    description: "Earned your first 10 points",
    icon: "🌱",
    criteria: { type: "points_threshold", value: 10 },
  },
  {
    id: "rising-star",
    name: "Rising Star",
    description: "Reached 50 points",
    icon: "⭐",
    criteria: { type: "points_threshold", value: 50 },
  },
  {
    id: "century-club",
    name: "Century Club",
    description: "Reached 100 points",
    icon: "💯",
    criteria: { type: "points_threshold", value: 100 },
  },
  {
    id: "lingo-legend",
    name: "LingoTrace Legend",
    description: "Reached 250 points",
    icon: "🏆",
    criteria: { type: "points_threshold", value: 250 },
  },
];

export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return BADGE_CATALOG.find((b) => b.id === badgeId);
}

/**
 * Automatic badge engine: given a student's current point total, awards any
 * point-threshold badges not already earned. Called after every points
 * transaction (see pointsService.awardPoints) and can also be re-run on
 * demand ("self-healing re-evaluation") to backfill badges retroactively —
 * e.g. after the catalog changes or a past bug is fixed.
 */
export async function evaluateBadgesForStudent(studentId: string, currentPoints: number) {
  const studentRef = doc(db, "students", studentId);
  const snapshot = await getDoc(studentRef);
  if (!snapshot.exists()) return;

  const existingBadgeIds: string[] = snapshot.data().badgeIds || [];
  const newlyEarned = BADGE_CATALOG.filter(
    (badge) =>
      badge.criteria.type === "points_threshold" &&
      badge.criteria.value !== undefined &&
      currentPoints >= badge.criteria.value &&
      !existingBadgeIds.includes(badge.id)
  );

  if (newlyEarned.length === 0) return;

  await updateDoc(studentRef, {
    badgeIds: arrayUnion(...newlyEarned.map((b) => b.id)),
  });

  return newlyEarned;
}

/** Re-runs badge evaluation for a student without a new points event — used for backfilling. */
export async function reEvaluateStudentBadges(studentId: string) {
  const studentRef = doc(db, "students", studentId);
  const snapshot = await getDoc(studentRef);
  if (!snapshot.exists()) return;
  const currentPoints = (snapshot.data().points as number) || 0;
  return evaluateBadgesForStudent(studentId, currentPoints);
}
