import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import type { ClassRanking, RankingEntry, RankingPosition } from "../../types";

const RANK_META: Record<
  1 | 2 | 3,
  {
    ring: string;
    chip: string;
    medal: string;
    order: string;
    avatarSize: string;
    barHeight: string;
  }
> = {
  1: {
    ring: "ring-4 ring-[#D4AF37]",
    chip: "bg-[#D4AF37] text-navy",
    medal: "🥇",
    order: "sm:order-2",
    avatarSize: "h-20 w-20 text-2xl",
    barHeight: "h-28",
  },
  2: {
    ring: "ring-4 ring-[#B0B7C6]",
    chip: "bg-[#B0B7C6] text-navy",
    medal: "🥈",
    order: "sm:order-1",
    avatarSize: "h-16 w-16 text-xl",
    barHeight: "h-20",
  },
  3: {
    ring: "ring-4 ring-[#B08D57]",
    chip: "bg-[#B08D57] text-cream-100",
    medal: "🥉",
    order: "sm:order-3",
    avatarSize: "h-16 w-16 text-xl",
    barHeight: "h-14",
  },
};

function namesLine(entries: RankingEntry[], separator: string) {
  return entries.map((e) => e.name).join(separator);
}

/** Overlapping avatar stack for a podium spot — one circle per tied student, capped at 3 with a "+N" overflow chip. */
function AvatarCluster({
  entries,
  meta,
  ringClass,
}: {
  entries: RankingEntry[];
  meta: (typeof RANK_META)[1 | 2 | 3];
  ringClass: string;
}) {
  const shown = entries.slice(0, 3);
  const overflow = entries.length - shown.length;
  return (
    <div className="relative flex -space-x-3">
      {shown.map((entry, i) => (
        <div
          key={entry.studentId}
          style={{ zIndex: shown.length - i }}
          className={`flex items-center justify-center rounded-full bg-navy font-semibold text-cream-100 border-2 border-white ${ringClass} ${meta.avatarSize}`}
        >
          {entry.name[0]?.toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={`flex items-center justify-center rounded-full bg-cream-300 font-semibold text-navy border-2 border-white ${meta.avatarSize}`}
        >
          +{overflow}
        </div>
      )}
      <span className="absolute -bottom-1.5 -right-1.5 text-xl leading-none">{meta.medal}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Classic skin — an elegant medal podium: refined typography, a subtle   */
/* gold shimmer border, and softly overlapping avatar medallions.         */
/* ---------------------------------------------------------------------- */

function ClassicSpot({ position }: { position: RankingPosition }) {
  const { t } = useTranslation();
  const meta = RANK_META[position.rank];
  return (
    <div className={`flex flex-col items-center gap-2 ${meta.order}`}>
      <AvatarCluster entries={position.entries} meta={meta} ringClass={meta.ring} />
      <p className="text-sm font-semibold text-navy text-center max-w-[9rem]">
        {namesLine(position.entries, " · ")}
      </p>
      <span className={`pill ${meta.chip}`}>
        {position.points} {t("students.points")}
      </span>
    </div>
  );
}

function ClassicPodium({ ranking, classLabel }: { ranking: ClassRanking; classLabel?: string }) {
  const { t } = useTranslation();
  const byRank = (rank: 1 | 2 | 3) => ranking.positions?.find((p) => p.rank === rank);
  return (
    <div className="card relative overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#B08D57] via-[#D4AF37] to-[#B0B7C6]" />
      <div className="flex items-center gap-2 mb-5">
        <Trophy size={18} className="text-gold" />
        <h3 className="font-serif text-lg font-semibold text-navy">
          {t("ranking.title")}
          {classLabel ? ` — ${classLabel}` : ""}
        </h3>
      </div>
      <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-6 sm:gap-8">
        {byRank(2) && <ClassicSpot position={byRank(2)!} />}
        {byRank(1) && <ClassicSpot position={byRank(1)!} />}
        {byRank(3) && <ClassicSpot position={byRank(3)!} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Kid skin — a bright, bouncy winner's podium: literal stepped blocks    */
/* of different heights, chunky drop shadows, and a playful wiggle.       */
/* ---------------------------------------------------------------------- */

function KidSpot({ position }: { position: RankingPosition }) {
  const { t } = useTranslation();
  const meta = RANK_META[position.rank];
  return (
    <div className={`flex flex-col items-center gap-1.5 ${meta.order} group`}>
      <div className="transition-transform duration-150 group-hover:-translate-y-1">
        <AvatarCluster entries={position.entries} meta={meta} ringClass="ring-4 ring-white" />
      </div>
      <p className="text-sm font-extrabold text-navy text-center max-w-[8rem] leading-tight">
        {namesLine(position.entries, " & ")}
      </p>
      <div
        className={`w-20 sm:w-24 ${meta.barHeight} rounded-t-2xl border-2 border-navy-100 ${meta.chip} flex flex-col items-center justify-start pt-2 font-extrabold shadow-[0_4px_0_rgb(var(--color-navy-900)/0.18)]`}
      >
        <span className="text-lg leading-none">{position.rank}</span>
        <span className="text-xs mt-1">
          {position.points} {t("students.points")}
        </span>
      </div>
    </div>
  );
}

function KidPodium({ ranking, classLabel }: { ranking: ClassRanking; classLabel?: string }) {
  const { t } = useTranslation();
  const byRank = (rank: 1 | 2 | 3) => ranking.positions?.find((p) => p.rank === rank);
  return (
    <div className="card relative overflow-hidden p-6 border-2 border-navy-100">
      <span className="absolute top-3 left-4 text-lg opacity-70 rotate-[-12deg]" aria-hidden="true">
        ✨
      </span>
      <span className="absolute top-4 right-6 text-lg opacity-70 rotate-12" aria-hidden="true">
        🎉
      </span>
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">🏆</span>
        <h3 className="text-lg font-extrabold text-navy">
          {t("ranking.title")}
          {classLabel ? ` — ${classLabel}` : ""}
        </h3>
      </div>
      <div className="flex items-end justify-center gap-4 sm:gap-6">
        {byRank(2) && <KidSpot position={byRank(2)!} />}
        {byRank(1) && <KidSpot position={byRank(1)!} />}
        {byRank(3) && <KidSpot position={byRank(3)!} />}
      </div>
    </div>
  );
}

/**
 * Podium display for a class's current weekly top-3 (with ties sharing a
 * spot — see `RankingPosition`). Renders nothing if there's no ranking
 * yet or nobody earned points that week. Reskins automatically between
 * the classic medallion look and the bright kid-mode podium blocks based
 * on the active app theme — purely presentational, doesn't trigger the
 * confetti celebration itself (the page that hosts it decides when/
 * whether to fire that, once per mount).
 */
export default function WeeklyChampions({
  ranking,
  classLabel,
}: {
  ranking: ClassRanking | null;
  classLabel?: string;
}) {
  const { theme } = useTheme();

  if (!ranking || !ranking.positions || ranking.positions.length === 0) return null;

  return theme === "kid" ? (
    <KidPodium ranking={ranking} classLabel={classLabel} />
  ) : (
    <ClassicPodium ranking={ranking} classLabel={classLabel} />
  );
}
