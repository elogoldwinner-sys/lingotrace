import { useTranslation } from "react-i18next";
import type { ClassRanking, RankingEntry, RankingPosition } from "../../types";
import trophy1st from "../../assets/trophies/1st.png";
import trophy2nd from "../../assets/trophies/2nd.png";
import trophy3rd from "../../assets/trophies/3rd.png";

const RANK_META: Record<1 | 2 | 3, { trophy: string }> = {
  1: { trophy: trophy1st },
  2: { trophy: trophy2nd },
  3: { trophy: trophy3rd },
};

/** Avatar for one champion — the same photo/initials-circle pattern used on the Students tab's cards, kept small here. */
function ChampionAvatar({ entry }: { entry: RankingEntry }) {
  if (entry.photoURL) {
    return (
      <img
        src={entry.photoURL}
        alt={entry.name}
        className="h-8 w-8 rounded-full object-cover border border-gold/40 shrink-0"
      />
    );
  }
  return (
    <div className="h-8 w-8 rounded-full bg-navy text-cream-100 flex items-center justify-center text-xs font-semibold shrink-0">
      {entry.name[0]?.toUpperCase()}
    </div>
  );
}

/** One row: avatar, name, points pill — one per tied student at a podium spot. */
function ChampionRow({ entry }: { entry: RankingEntry }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <ChampionAvatar entry={entry} />
      <span className="text-sm font-semibold text-navy truncate max-w-[7rem] sm:max-w-[8rem]">
        {entry.name}
      </span>
      <span className="pill bg-navy text-cream-200 whitespace-nowrap ms-auto">
        {entry.points} {t("students.points")}
      </span>
    </div>
  );
}

/** One podium column: trophy illustration on top, the tied champion row(s) for that spot listed below it. */
function PodiumSpot({ position }: { position: RankingPosition }) {
  const meta = RANK_META[position.rank];
  return (
    <div className="flex flex-col items-center gap-3 w-full sm:w-56">
      <img src={meta.trophy} alt={`#${position.rank}`} className="h-24 sm:h-28 w-auto select-none" />
      <div className="flex flex-col gap-2 w-full">
        {position.entries.map((entry) => (
          <ChampionRow key={entry.studentId} entry={entry} />
        ))}
      </div>
    </div>
  );
}

/**
 * Podium display for a class's current weekly top-3 (with ties sharing a
 * spot — see `RankingPosition`): a trophy illustration for each position,
 * with the tied champion(s) for that spot listed underneath by avatar,
 * name, and points — matching the same look as a student's card on the
 * Students tab. Renders nothing if there's no ranking yet or nobody has
 * points.
 */
export default function WeeklyChampions({
  ranking,
  classLabel,
}: {
  ranking: ClassRanking | null;
  classLabel?: string;
}) {
  const { t } = useTranslation();

  if (!ranking || !ranking.positions || ranking.positions.length === 0) return null;

  const byRank = (rank: 1 | 2 | 3) => ranking.positions?.find((p) => p.rank === rank);

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#B08D57] via-[#D4AF37] to-[#B0B7C6]" />
      <h3 className="text-sm sm:text-base font-semibold text-navy mb-4">
        🎉 {t("ranking.title")}
        {classLabel ? ` — ${classLabel}` : ""}
      </h3>
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-6 sm:gap-4">
        {byRank(1) && <PodiumSpot position={byRank(1)!} />}
        {byRank(2) && <PodiumSpot position={byRank(2)!} />}
        {byRank(3) && <PodiumSpot position={byRank(3)!} />}
      </div>
    </div>
  );
}
