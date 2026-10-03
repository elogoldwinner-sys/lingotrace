import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, RotateCcw } from "lucide-react";
import Modal from "./Modal";
import { STUDENT_GROUPS, type StudentGroup, type StudentRecord } from "../../types";
import card1 from "../../assets/numbered-cards/card-1.png";
import card2 from "../../assets/numbered-cards/card-2.png";
import card3 from "../../assets/numbered-cards/card-3.png";
import card4 from "../../assets/numbered-cards/card-4.png";

const CARD_IMAGES: Record<number, string> = { 1: card1, 2: card2, 3: card3, 4: card4 };
const CARD_NUMBERS = [1, 2, 3, 4];

/** Each group has its own deck: the numbers already drawn this round, and the last one drawn (so a new round never opens with the card that just closed the previous one). */
interface Deck {
  drawn: number[];
  last: number | null;
}

/**
 * "Numbered Heads Together" card draw. The teacher gives every student in a
 * group a printed number 1–4; drawing a card here picks which number answers.
 * Each group draws from its own shuffled deck of 1–4 and every number comes up
 * once before any number repeats — then a fresh round starts. Nothing is
 * stored in the database: the decks live only while this page is open.
 */
export default function NumberedHeadsModal({
  open,
  onClose,
  students,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentRecord[];
}) {
  const { t } = useTranslation();
  const [group, setGroup] = useState<StudentGroup | null>(null);
  const [decks, setDecks] = useState<Partial<Record<StudentGroup, Deck>>>({});
  const [shown, setShown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const groupCounts = STUDENT_GROUPS.map((g) => ({
    group: g,
    count: students.filter((s) => s.group === g).length,
  })).filter((g) => g.count > 0);

  const activeGroup = group && groupCounts.some((g) => g.group === group) ? group : groupCounts[0]?.group ?? null;
  const deck: Deck = (activeGroup && decks[activeGroup]) || { drawn: [], last: null };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function pickGroup(g: StudentGroup) {
    if (spinning) return;
    setGroup(g);
    setShown((decks[g]?.last ?? null));
  }

  function draw() {
    if (!activeGroup || spinning) return;
    const g = activeGroup;
    let drawn = deck.drawn;
    let candidates = CARD_NUMBERS.filter((n) => !drawn.includes(n));
    if (candidates.length === 0) {
      // Every number has been drawn: start a new round, but don't open it with the card that just closed the last one.
      drawn = [];
      candidates = CARD_NUMBERS.filter((n) => n !== deck.last);
    }
    const winner = candidates[Math.floor(Math.random() * candidates.length)];

    setSpinning(true);
    let ticks = 0;
    timerRef.current = setInterval(() => {
      ticks += 1;
      if (ticks >= 10) {
        if (timerRef.current) clearInterval(timerRef.current);
        setShown(winner);
        setDecks((prev) => ({ ...prev, [g]: { drawn: [...drawn, winner], last: winner } }));
        setSpinning(false);
      } else {
        setShown(CARD_NUMBERS[Math.floor(Math.random() * CARD_NUMBERS.length)]);
      }
    }, 90);
  }

  function resetGroup() {
    if (!activeGroup || spinning) return;
    setDecks((prev) => ({ ...prev, [activeGroup]: { drawn: [], last: null } }));
    setShown(null);
  }

  const roundComplete = deck.drawn.length === CARD_NUMBERS.length;

  return (
    <Modal open={open} onClose={onClose} title={t("numberedHeads.title")} widthClassName="max-w-md">
      <style>{`@keyframes nh-pop{0%{transform:scale(.7) rotate(-4deg);opacity:0}70%{transform:scale(1.06) rotate(1deg);opacity:1}100%{transform:scale(1) rotate(0)}}.nh-pop{animation:nh-pop .35s ease-out}`}</style>
      {groupCounts.length === 0 ? (
        <p className="text-sm text-cream-600">{t("numberedHeads.noGroups")}</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-2">
            {groupCounts.map(({ group: g, count }) => (
              <button
                key={g}
                onClick={() => pickGroup(g)}
                disabled={spinning}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                  activeGroup === g
                    ? "border-gold bg-gold text-white"
                    : "border-cream-400 bg-white text-navy hover:border-gold/60"
                }`}
              >
                {t("numberedHeads.groupLabel", { group: g })}
                <span className="ms-1.5 text-xs opacity-70">({count})</span>
              </button>
            ))}
          </div>

          <div className="flex h-72 items-center justify-center">
            {shown ? (
              <img
                key={spinning ? "spin" : `done-${shown}-${deck.drawn.length}`}
                src={CARD_IMAGES[shown]}
                alt={t("numberedHeads.cardAlt", { number: shown })}
                className={`h-72 w-auto drop-shadow-lg ${spinning ? "opacity-90" : "nh-pop"}`}
              />
            ) : (
              <p className="text-sm text-cream-600">{t("numberedHeads.prompt")}</p>
            )}
          </div>

          <div className="flex items-center gap-2" aria-label={t("numberedHeads.progress", { count: deck.drawn.length })}>
            {CARD_NUMBERS.map((n) => (
              <span
                key={n}
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ${
                  deck.drawn.includes(n)
                    ? "border-gold bg-gold text-white"
                    : "border-cream-400 bg-white text-navy/40"
                }`}
              >
                {n}
              </span>
            ))}
          </div>
          <p className="text-xs text-cream-600">
            {roundComplete ? t("numberedHeads.roundComplete") : t("numberedHeads.progress", { count: deck.drawn.length })}
          </p>

          <div className="flex items-center gap-2">
            <button onClick={draw} disabled={spinning} className="btn-gold py-2 px-5 text-sm disabled:opacity-60">
              <Shuffle size={16} className={spinning ? "animate-spin" : ""} />
              {roundComplete ? t("numberedHeads.drawNewRound") : t("numberedHeads.draw")}
            </button>
            <button
              onClick={resetGroup}
              disabled={spinning || deck.drawn.length === 0}
              className="btn-secondary py-2 px-3 text-sm disabled:opacity-40"
              title={t("numberedHeads.reset")}
            >
              <RotateCcw size={15} />
              {t("numberedHeads.reset")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
