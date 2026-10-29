import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, Check, X, Download, Printer } from "lucide-react";
import Modal from "./Modal";
import { STUDENT_GROUPS, type StudentGroup, type StudentRecord } from "../../types";
import { awardPoints, awardPointsToMany } from "../../lib/services/pointsService";
import { useAuth } from "../../contexts/AuthContext";
import { POINTS_REASON_ICONS } from "../../lib/pointsReasons";
import { downloadCardPng, downloadCardsZip, printCards, type CardArt } from "../../lib/cardExport";
import type { PointsReason } from "../../types";
import { unlockSound } from "../../lib/sounds";
import card1 from "../../assets/numbered-cards/card-1.png";
import card2 from "../../assets/numbered-cards/card-2.png";
import card3 from "../../assets/numbered-cards/card-3.png";
import card4 from "../../assets/numbered-cards/card-4.png";

const CARD_IMAGES: Record<number, string> = { 1: card1, 2: card2, 3: card3, 4: card4 };
const CARD_NUMBERS = [1, 2, 3, 4];
const CARD_ARTS: CardArt[] = CARD_NUMBERS.map((n) => ({ number: n, url: CARD_IMAGES[n] }));

/** Marks the teacher can give with one tap. */
const QUICK_MARKS = [1, 2, 3, 5];

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A fresh random group order each round — and never the same order twice in a row, so students can't predict their turn. */
function shuffledOrder(groups: StudentGroup[], previous: StudentGroup[]): StudentGroup[] {
  if (groups.length < 2) return groups;
  let order = shuffled(groups);
  for (let attempt = 0; attempt < 10 && order.join() === previous.join(); attempt++) {
    order = shuffled(groups);
  }
  return order;
}

interface Round {
  number: number;
  /** Groups in the (shuffled) order they will be called. */
  order: StudentGroup[];
  /** Index into `order` of the group currently answering; `order.length` means the round is over. */
  step: number;
  marksGiven: number;
}

/**
 * "Numbered Heads Together" card draw. Every student in a group has a number
 * (their position in the group's name-sorted list). The teacher presses
 * "Draw a card": one number 1–4 comes up, and the groups are then called one
 * after another in a freshly shuffled order. For each group the student
 * holding the drawn number is highlighted and the teacher either adds marks
 * (then the next group is called automatically) or cancels (wrong answer —
 * the next group is called, nothing is awarded). Numbers don't repeat until
 * all four have come up. Nothing but the awarded marks is stored.
 */
export default function NumberedHeadsModal({
  open,
  onClose,
  students,
  teacherId,
  sessionId,
  excludedIds = [],
  onMarkSaved,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentRecord[];
  teacherId: string;
  /** The open session, so the marks show up in its Session Summary. */
  sessionId?: string;
  /** Students who can't receive marks right now (absent / excused) — skipped by a whole-group award. */
  excludedIds?: string[];
  /** Called after marks are saved (used for the on-screen "Perfect!" reinforcement). */
  onMarkSaved?: (amount: number) => void;
}) {
  const { t } = useTranslation();
  const [round, setRound] = useState<Round | null>(null);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [lastNumber, setLastNumber] = useState<number | null>(null);
  const [lastOrder, setLastOrder] = useState<StudentGroup[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customMark, setCustomMark] = useState(1);
  const { profile } = useAuth();
  // Give the mark to every student in the group, not only the one whose number was drawn (off by default).
  const [wholeGroup, setWholeGroup] = useState(false);
  const [groupReason, setGroupReason] = useState<PointsReason>("teamPlayer");
  const [cardBusy, setCardBusy] = useState("");
  const [cardMsg, setCardMsg] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Students of each group, numbered 1..n by name so the numbering is stable between draws.
  const groups = useMemo(() => {
    const map = new Map<StudentGroup, StudentRecord[]>();
    for (const g of STUDENT_GROUPS) {
      const members = students
        .filter((s) => s.group === g)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (members.length > 0) map.set(g, members);
    }
    return map;
  }, [students]);
  const groupKeys = useMemo(() => Array.from(groups.keys()), [groups]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const roundActive = !!round && round.step < round.order.length;
  const roundOver = !!round && round.step >= round.order.length;
  const currentGroup = roundActive ? round!.order[round!.step] : null;
  const members = currentGroup ? groups.get(currentGroup) || [] : [];
  const target = round ? members[round.number - 1] : undefined;
  // Everyone who gets the mark when "whole group" is on (absent / excused students are skipped).
  const recipients = members.filter((m) => m.id === target?.id || !excludedIds.includes(m.id));

  function draw() {
    if (spinning || saving || groupKeys.length === 0) return;
    // Every number comes up once before any repeats; a new cycle never opens with the number that closed the last one.
    let used = drawnNumbers;
    let candidates = CARD_NUMBERS.filter((n) => !used.includes(n));
    if (candidates.length === 0) {
      used = [];
      candidates = CARD_NUMBERS.filter((n) => n !== lastNumber);
    }
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const order = shuffledOrder(groupKeys, lastOrder);

    setError("");
    setRound(null);
    setSpinning(true);
    let ticks = 0;
    timerRef.current = setInterval(() => {
      ticks += 1;
      if (ticks >= 10) {
        if (timerRef.current) clearInterval(timerRef.current);
        setShown(winner);
        setDrawnNumbers([...used, winner]);
        setLastNumber(winner);
        setLastOrder(order);
        setRound({ number: winner, order, step: 0, marksGiven: 0 });
        setSpinning(false);
      } else {
        setShown(CARD_NUMBERS[Math.floor(Math.random() * CARD_NUMBERS.length)]);
      }
    }, 90);
  }

  function advance(extraMarks = 0) {
    setCustomMark(1);
    setWholeGroup(false);
    setGroupReason("teamPlayer");
    setRound((r) => (r ? { ...r, step: r.step + 1, marksGiven: r.marksGiven + extraMarks } : r));
  }

  async function addMark(amount: number) {
    if (!target || saving || !Number.isFinite(amount) || amount === 0) return;
    unlockSound();
    setSaving(true);
    setError("");
    try {
      const base = {
        classId: target.classId,
        amount,
        // One student: always Participation Star. Whole group: Team Player or Discipline Hero.
        reason: (wholeGroup ? groupReason : "participationStar") as PointsReason,
        awardedBy: teacherId,
        sessionId,
      };
      if (wholeGroup) await awardPointsToMany(recipients.map((m) => m.id), base);
      else await awardPoints({ ...base, studentId: target.id });
      onMarkSaved?.(amount);
      advance(1);
    } catch {
      setError(t("numberedHeads.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function runCardAction(key: string, action: () => Promise<{ logoApplied: boolean }>) {
    setCardBusy(key);
    setCardMsg("");
    try {
      const { logoApplied } = await action();
      if (!logoApplied) setCardMsg(t("numberedHeads.logoFailed"));
    } catch (err) {
      console.error("Card export failed", err);
      setCardMsg(t("numberedHeads.cardError"));
    } finally {
      setCardBusy("");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("numberedHeads.title")} widthClassName="max-w-md">
      <style>{`@keyframes nh-pop{0%{transform:scale(.7) rotate(-4deg);opacity:0}70%{transform:scale(1.06) rotate(1deg);opacity:1}100%{transform:scale(1) rotate(0)}}.nh-pop{animation:nh-pop .35s ease-out}`}</style>
      {groupKeys.length === 0 ? (
        <p className="text-sm text-cream-600">{t("numberedHeads.noGroups")}</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* The drawn card */}
          <div className="flex h-44 items-center justify-center">
            {shown ? (
              <img
                key={spinning ? "spin" : `done-${shown}-${drawnNumbers.length}`}
                src={CARD_IMAGES[shown]}
                alt={t("numberedHeads.cardAlt", { number: shown })}
                className={`h-44 w-auto drop-shadow-lg ${spinning ? "opacity-90" : "nh-pop"}`}
              />
            ) : (
              <p className="text-sm text-cream-600">{t("numberedHeads.prompt")}</p>
            )}
          </div>

          {/* Group order for this round, current group highlighted */}
          {round && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {round.order.map((g, i) => (
                <span
                  key={g}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    i === round.step
                      ? "border-gold bg-gold text-white"
                      : i < round.step
                        ? "border-cream-400 bg-cream-200 text-navy/40 line-through"
                        : "border-cream-400 bg-white text-navy/70"
                  }`}
                >
                  {t("numberedHeads.groupLabel", { group: g })}
                </span>
              ))}
            </div>
          )}

          {/* Current group: students + mark / cancel */}
          {roundActive && currentGroup && round && (
            <div className="w-full space-y-3">
              <h3 className="text-center text-sm font-semibold text-navy">
                {t("numberedHeads.groupTurn", { group: currentGroup, number: round.number })}
              </h3>
              <ul className="space-y-1.5">
                {members.map((s, i) => {
                  const isTarget = s.id === target?.id;
                  return (
                    <li
                      key={s.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        isTarget ? "border-gold bg-gold-50 font-semibold text-navy" : "border-cream-400 bg-white text-navy/60"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isTarget ? "bg-gold text-white" : "bg-cream-300 text-navy/60"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate">{s.name}</span>
                    </li>
                  );
                })}
              </ul>

              {target ? (
                <div className="space-y-2">
                  <p className="text-center text-xs text-cream-600">
                    {t("numberedHeads.addMarkFor", { name: target.name })}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUICK_MARKS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={saving}
                        onClick={() => addMark(m)}
                        className="btn-gold py-1.5 px-4 text-sm disabled:opacity-60"
                      >
                        +{m}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      value={customMark}
                      onChange={(e) => setCustomMark(Number(e.target.value))}
                      className="input-field w-16 py-1.5 text-center text-sm"
                      aria-label={t("numberedHeads.customMark")}
                    />
                    <button
                      type="button"
                      disabled={saving || customMark < 1}
                      onClick={() => addMark(customMark)}
                      className="btn-primary py-1.5 px-3 text-sm disabled:opacity-60"
                    >
                      <Check size={15} />
                      {t("numberedHeads.addMark")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-cream-600">
                  {t("numberedHeads.noStudentWithNumber", { number: round.number })}
                </p>
              )}

              {error && <p className="text-center text-xs text-red-600">{error}</p>}

              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => advance(0)}
                  className="btn-secondary py-1.5 px-4 text-sm disabled:opacity-60"
                >
                  <X size={15} />
                  {target ? t("numberedHeads.cancel") : t("numberedHeads.next")}
                </button>
              </div>

              {target && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 rounded-lg border border-cream-300 bg-cream-100/60 px-3 py-2 text-sm text-navy">
                    <input type="checkbox" className="mt-0.5" checked={wholeGroup} onChange={(e) => setWholeGroup(e.target.checked)} />
                    <span>{t("numberedHeads.wholeGroup", { group: currentGroup, count: recipients.length })}</span>
                  </label>
                  {wholeGroup && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {(["teamPlayer", "disciplineHero"] as PointsReason[]).map((r) => {
                        const Icon = POINTS_REASON_ICONS[r];
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setGroupReason(r)}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                              groupReason === r
                                ? "border-gold bg-gold-50 text-gold"
                                : "border-cream-300 text-cream-600 hover:border-gold/50 hover:text-gold"
                            }`}
                          >
                            {Icon && <Icon size={14} />}
                            {t(`points.reasons.${r}`)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {roundOver && round && (
            <p className="text-center text-sm font-semibold text-navy">
              {t("numberedHeads.roundDone", { count: round.marksGiven })}
            </p>
          )}

          <div className="w-full border-t border-cream-300 pt-3 text-center">
            <p className="mb-2 text-xs font-semibold text-navy">{t("numberedHeads.cardsTitle")}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={!!cardBusy}
                onClick={() => runCardAction("print", () => printCards(CARD_ARTS, profile?.schoolLogoURL, t("numberedHeads.cardsTitle")))}
                className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-60"
              >
                <Printer size={14} />
                {t("numberedHeads.printCards")}
              </button>
              <button
                type="button"
                disabled={!!cardBusy}
                onClick={() => runCardAction("zip", () => downloadCardsZip(CARD_ARTS, profile?.schoolLogoURL, t("numberedHeads.zipName")))}
                className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-60"
              >
                <Download size={14} />
                {t("numberedHeads.downloadAll")}
              </button>
              {shown && !spinning && (
                <button
                  type="button"
                  disabled={!!cardBusy}
                  onClick={() => runCardAction("one", () => downloadCardPng(CARD_ARTS[shown - 1], profile?.schoolLogoURL))}
                  className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-60"
                >
                  <Download size={14} />
                  {t("numberedHeads.downloadOne", { number: shown })}
                </button>
              )}
            </div>
            {!profile?.schoolLogoURL && <p className="mt-1 text-[11px] text-cream-600">{t("numberedHeads.noLogoHint")}</p>}
            {cardBusy && <p className="mt-1 text-[11px] text-cream-600">{t("common.loading")}</p>}
            {cardMsg && <p className="mt-1 text-[11px] text-red-600">{cardMsg}</p>}
          </div>

          {!roundActive && (
            <button onClick={draw} disabled={spinning} className="btn-gold py-2 px-5 text-sm disabled:opacity-60">
              <Shuffle size={16} className={spinning ? "animate-spin" : ""} />
              {t("numberedHeads.draw")}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
