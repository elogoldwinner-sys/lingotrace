/**
 * Features the platform admin can switch on or off for each school (the free vs. paid line).
 * A feature that is not listed in a school's entitlements is OFF.
 *
 * To make another feature controllable: add a key here, then wrap its UI in <FeatureGate feature="…">
 * (or check useFeature("…")), and — if it writes data — add `featureOn(schoolId, '…')` to the matching rule.
 */
export const FEATURE_KEYS = [
  "leadership",
  "supervisors",
  "compareClasses",
  "compareSubjects",
  "examsGames",
  "numberedHeads",
  "editReasons",
  "certificates",
  "letterhead",
  "parentAlerts",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureMap = Partial<Record<FeatureKey, boolean>>;

export interface FeatureMeta {
  key: FeatureKey;
  label: string;
  description: string;
  /** Who feels the lock: the principal (school portal) or the school's teachers. */
  audience: "principal" | "teachers";
}

export const FEATURES: FeatureMeta[] = [
  {
    key: "leadership",
    label: "Department heads & counselors",
    description: "The principal can add department heads and school counselors to the school portal.",
    audience: "principal",
  },
  {
    key: "supervisors",
    label: "Supervisors & coordinators",
    description: "Department heads can add supervisors and coordinators for their subject.",
    audience: "principal",
  },
  {
    key: "compareClasses",
    label: "Comparing classes",
    description: "Compare classes against each other (school portal Compare tab and teachers' Class statistics).",
    audience: "principal",
  },
  {
    key: "compareSubjects",
    label: "Comparing classes across subjects",
    description: "Compare the subjects of one class against each other (school portal and teachers' Class statistics).",
    audience: "principal",
  },
  {
    key: "examsGames",
    label: "Exams & Games",
    description: "Teachers can link GATway exams and LingoBite Play games to their classes.",
    audience: "teachers",
  },
  {
    key: "numberedHeads",
    label: "Numbered Heads Together",
    description: "Random group-number picker inside a live session.",
    audience: "teachers",
  },
  {
    key: "editReasons",
    label: "Edit mark reasons",
    description: "Teachers can hide built-in reasons and add their own for giving / deducting marks.",
    audience: "teachers",
  },
  {
    key: "certificates",
    label: "Certificates",
    description: "Teachers can create and download student certificates.",
    audience: "teachers",
  },
  {
    key: "letterhead",
    label: "School letterhead",
    description: "The principal uploads a PDF letterhead and every printed report is placed on it.",
    audience: "principal",
  },
  {
    key: "parentAlerts",
    label: "Automatic parent alerts",
    description: "The principal can switch on automatic alerts: every note a teacher writes is sent to the parent's WhatsApp.",
    audience: "principal",
  },
];

export const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f])) as Record<FeatureKey, FeatureMeta>;

/** Everything on — what a paid school gets. */
export const allFeaturesOn = (): Record<FeatureKey, boolean> =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>;

/** Everything off — the basic (free) plan. */
export const allFeaturesOff = (): Record<FeatureKey, boolean> =>
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>;

/* ───────────────────────── Numeric limits ───────────────────────── */

/**
 * Per-school caps the admin can set. `null` = unlimited. They only stop NEW additions — nothing that already exists
 * is ever removed. Firestore rules cannot count documents, so these are enforced in the app (see useLimit).
 */
export const LIMIT_KEYS = ["maxTeachers", "maxClassesPerTeacher", "maxStudentsPerClass"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type LimitMap = Record<LimitKey, number | null>;

export const LIMIT_META: Record<LimitKey, { label: string; description: string }> = {
  maxTeachers: { label: "Teachers in the school", description: "How many teachers the principal can approve." },
  maxClassesPerTeacher: { label: "Classes per teacher", description: "How many classes each teacher can create." },
  maxStudentsPerClass: { label: "Students per class", description: "How many students a teacher can add to one class." },
};

/** What a school on the basic plan gets (also used when a school has no plan record yet). */
export const FREE_LIMITS: LimitMap = { maxTeachers: 5, maxClassesPerTeacher: 6, maxStudentsPerClass: 40 };
export const UNLIMITED_LIMITS: LimitMap = { maxTeachers: null, maxClassesPerTeacher: null, maxStudentsPerClass: null };
