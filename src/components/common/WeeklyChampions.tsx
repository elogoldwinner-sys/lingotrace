import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import type { ClassRanking, RankingEntry, RankingPosition } from "../../types";

const RANK_META: Record<
  1 | 2 | 3,
  { cup: string; block: string; order: string; blockHeight: string }
> = {
  1: { cup: "🏆", block: "bg-[#D4AF37] text-navy", order: "sm:order-2", blockHeight: "h-9" },
  2: { cup: "🥈", block: "bg-[#B0B7C6] text-navy", order: "sm:order-1", blockHeight: "h-7" },
  3: { cup: "🥉", block: "bg-[#B08D57] text-cream-100", order: "sm:order-3", blockHeight: "h-5" },
};

function namesLine(entries: RankingEntry[], separator: string) {
  return entries.map((e) => e.name).join(separator);
}

/**
 * One compact podium column: cup icon, a short colored block labeled with
 * the rank number, then the name(s) in small text underneath (a tie shows
 * every tied name, joined). No avatars, no point pills — kept deliberately
 * small so this can sit in a page header without pushing content down.
 */
function PodiumSpot({
  position,
  nameSeparator,
}: {
  position: RankingPosition;
  nameSeparator: string;
}) {
  const meta = RANK_META[position.rank];
  return (
    <div className={`flex flex-col items-center gap-1 w-16 sm:w-20 ${meta.order}`}>
      <span className="text-xl leading-none" aria-hidden="true">
        {meta.cup}
      </span>
      <div
        className={`w-full ${meta.blockHeight} rounded-t-md ${meta.block} flex items-center justify-center text-xs font-bold`}
      >
        {position.rank}
      </div>
      <p
        className="text-[11px] leading-tight font-semibold text-navy text-center line-clamp-2"
        title={namesLine(position.entries, nameSeparator)}
      >
        {namesLine(position.entries, nameSeparator)}
      </p>
    </div>
  );
}

/**
 * Compact podium display for a class's current weekly top-3 (with ties
 * sharing a spot — see `RankingPosition`). Deliberately small — a single
 * row of cup + short block + name, no avatars or point pills — so it sits
 * comfortably in a page header without pushing the rest of the page down.
 * Renders nothing if there's no ranking yet or nobody has points. Skins
 * lightly between classic and kid mode (rounder, bouncier blocks in kid
 * mode) based on the active app theme.
 */
export default function WeeklyChampions({
  ranking,
  classLabel,
}: {
  ranking: ClassRanking | null;
  classLabel?: string;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isKid = theme === "kid";

  if (!ranking || !ranking.positions || ranking.positions.length === 0) return null;

  const byRank = (rank: 1 | 2 | 3) => ranking.positions?.find((p) => p.rank === rank);
  const nameSeparator = isKid ? " & " : " · ";

  return (
    <div
      className={`card relative overflow-hidden flex flex-wrap items-center gap-3 sm:gap-4 px-4 py-2.5 ${
        isKid ? "border-2 border-navy-100" : ""
      }`}
    >
      {!isKid && (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#B08D57] via-[#D4AF37] to-[#B0B7C6]" />
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-sm" aria-hidden="true">
          {isKid ? "🎉" : "✦"}
        </span>
        <span className={`text-xs sm:text-sm font-semibold text-navy ${isKid ? "font-extrabold" : ""}`}>
          {t("ranking.title")}
          {classLabel ? ` — ${classLabel}` : ""}
        </span>
      </div>
      <div className="flex items-end gap-3 sm:gap-4 ms-auto">
        {byRank(2) && <PodiumSpot position={byRank(2)!} nameSeparator={nameSeparator} />}
        {byRank(1) && <PodiumSpot position={byRank(1)!} nameSeparator={nameSeparator} />}
        {byRank(3) && <PodiumSpot position={byRank(3)!} nameSeparator={nameSeparator} />}
      </div>
    </div>
  );
}
