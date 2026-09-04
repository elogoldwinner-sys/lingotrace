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

/** One row: name + points pill — one per tied student at a podium spot. No photo, just text, so it never depends on an avatar being uploaded. */
function ChampionRow({ entry }: { entry: RankingEntry }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <span className="text-sm font-semibold text-navy text-center break-words">{entry.name}</span>
      <span className="pill bg-navy text-cream-200 whitespace-nowrap">
        {entry.points} {t("students.points")}
      </span>
    </div>
  );
}

/**
 * One podium column: trophy illustration on top, the tied champion row(s)
 * for that spot listed below it. Sized fluidly (percentage/em-based, no
 * fixed pixel widths) so it shrinks cleanly on narrow phone screens
 * instead of forcing the row to overflow.
 */
function PodiumSpot({ position }: { position: RankingPosition }) {
  const meta = RANK_META[position.rank];
  return (
    <div className="flex flex-col items-center gap-2 w-full min-w-0">
      <img
        src={meta.trophy}
        alt={`#${position.rank}`}
        className="h-16 sm:h-24 w-auto max-w-full select-none"
      />
      <div className="flex flex-col gap-1.5 w-full items-center min-w-0">
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
 * with the tied champion(s) for that spot listed underneath by name and
 * points. Stacks to a single column on narrow (phone-width) screens via
 * a CSS grid and never uses fixed pixel widths, so nothing gets clipped
 * or pushed off-screen regardless of viewport size. Renders nothing if
 * there's no ranking yet or nobody has points.
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
    <div className="card relative overflow-hidden p-4 sm:p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#B08D57] via-[#D4AF37] to-[#B0B7C6]" />
      <h3 className="text-sm sm:text-base font-semibold text-navy mb-4">
        🎉 {t("ranking.title")}
        {classLabel ? ` — ${classLabel}` : ""}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-4">
        {byRank(1) && <PodiumSpot position={byRank(1)!} />}
        {byRank(2) && <PodiumSpot position={byRank(2)!} />}
        {byRank(3) && <PodiumSpot position={byRank(3)!} />}
      </div>
    </div>
  );
}
