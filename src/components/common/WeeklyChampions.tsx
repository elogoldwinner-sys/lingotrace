import { useTranslation } from "react-i18next";
import type { ClassRanking, RankingEntry } from "../../types";

const RANK_STYLES = {
  gold: {
    ring: "ring-4 ring-[#D4AF37]",
    badge: "bg-[#D4AF37] text-navy",
    medal: "🥇",
    order: "sm:order-2",
    size: "h-20 w-20 text-2xl",
  },
  silver: {
    ring: "ring-4 ring-[#B0B7C6]",
    badge: "bg-[#B0B7C6] text-navy",
    medal: "🥈",
    order: "sm:order-1",
    size: "h-16 w-16 text-xl",
  },
  bronze: {
    ring: "ring-4 ring-[#B08D57]",
    badge: "bg-[#B08D57] text-cream-100",
    medal: "🥉",
    order: "sm:order-3",
    size: "h-16 w-16 text-xl",
  },
} as const;

function PodiumSpot({ rank, entry }: { rank: keyof typeof RANK_STYLES; entry: RankingEntry }) {
  const { t } = useTranslation();
  const style = RANK_STYLES[rank];
  return (
    <div className={`flex flex-col items-center gap-2 ${style.order}`}>
      <div className="relative">
        <div
          className={`flex items-center justify-center rounded-full bg-navy font-semibold text-cream-100 ${style.ring} ${style.size}`}
        >
          {entry.name[0]?.toUpperCase()}
        </div>
        <span className="absolute -bottom-1.5 -right-1.5 text-xl leading-none">{style.medal}</span>
      </div>
      <p className="text-sm font-semibold text-navy text-center">{entry.name}</p>
      <span className={`pill ${style.badge}`}>
        {entry.points} {t("students.points")}
      </span>
    </div>
  );
}

/**
 * Podium display for a class's current weekly top-3. Renders nothing if
 * there's no ranking yet or nobody earned points that week — purely
 * presentational, doesn't trigger the confetti celebration itself (the
 * page that hosts it decides when/whether to fire that, once per mount).
 */
export default function WeeklyChampions({
  ranking,
  classLabel,
}: {
  ranking: ClassRanking | null;
  classLabel?: string;
}) {
  const { t } = useTranslation();

  if (!ranking || !ranking.gold) return null;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">🎉</span>
        <h3 className="text-lg font-semibold text-navy">
          {t("ranking.title")}
          {classLabel ? ` — ${classLabel}` : ""}
        </h3>
      </div>
      <div className="flex flex-col sm:flex-row items-center sm:items-end justify-center gap-6 sm:gap-8">
        {ranking.silver && <PodiumSpot rank="silver" entry={ranking.silver} />}
        <PodiumSpot rank="gold" entry={ranking.gold} />
        {ranking.bronze && <PodiumSpot rank="bronze" entry={ranking.bronze} />}
      </div>
    </div>
  );
}
