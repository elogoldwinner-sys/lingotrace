import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import confetti from "canvas-confetti";
import { RotateCcw } from "lucide-react";
import SoundToggle from "./SoundToggle";
import { playReveal, playTick, unlockSound } from "../../lib/sounds";
import Modal from "./Modal";
import StudentAvatar from "../avatars/StudentAvatar";
import type { StudentRecord } from "../../types";

/**
 * Cartoon segment colours, taken from the LingoBite card art (sky blue,
 * sunny yellow, coral, purple, mint, pink). Used in rotation around the wheel.
 */
const SEGMENT_COLORS = ["#38a8ff", "#ffc933", "#ff7a59", "#8b5cf6", "#34d399", "#ff6fb1"];
const INACTIVE_FILL = "#ddd8ee";
const INACTIVE_TEXT = "#8f88aa";

const CX = 200;
const CY = 200;
const RADIUS = 168; // coloured segments
const RIM_OUTER = 190; // outer edge of the white rim
const LIGHTS = 20;

const SPIN_MS = 5200;
const EXTRA_TURNS = 6;
/** How long the chosen name stays on screen before the marks window opens by itself. */
const REVEAL_MS = 4500;

function polar(deg: number, r: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function wedgePath(a0: number, a1: number): string {
  const [x0, y0] = polar(a0, RADIUS);
  const [x1, y1] = polar(a1, RADIUS);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${CX} ${CY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${RADIUS} ${RADIUS} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** Colour for segment i — never the same as its neighbours (including last next to first). */
function colorFor(i: number, n: number): string {
  const len = SEGMENT_COLORS.length;
  let idx = i % len;
  if (n > 1 && i === n - 1 && idx === 0) idx = 2;
  return SEGMENT_COLORS[idx];
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function fitName(name: string, n: number): { text: string; size: number } {
  const arcLimit = (2 * Math.PI * 115 * 0.55) / n; // keeps lettering inside its own wedge
  const base = n <= 8 ? 20 : n <= 14 ? 16 : n <= 22 ? 13 : n <= 32 ? 10.5 : 8.5;
  const clean = name.trim();
  const capacity = (size: number) => Math.max(4, Math.floor(104 / (size * 0.58)));

  let size = Math.max(7, Math.min(base, arcLimit));
  if (clean.length <= capacity(size)) return { text: clean, size };

  // Too long: shrink the lettering a little first…
  size = Math.max(7, size * 0.8);
  if (clean.length <= capacity(size)) return { text: clean, size };

  // …then fall back to the first name, and only then cut with "…".
  const first = clean.split(/\s+/)[0];
  const max = capacity(size);
  if (first.length <= max) return { text: first, size: Math.min(base, arcLimit) };
  return { text: `${first.slice(0, max - 1)}…`, size };
}

interface NamesWheelModalProps {
  open: boolean;
  onClose: () => void;
  /** Every student in the class — they all appear on the wheel. */
  students: StudentRecord[];
  /** Only these (present/late) can actually be picked; the rest are greyed out. */
  eligibleIds: Set<string>;
  /** Runs the round logic (no repeats until everyone has had a turn) and returns the winner's id, or null if nobody can be picked. */
  onDraw: () => string | null;
  /** The wheel has stopped on this student. */
  onLanded: (studentId: string) => void;
  /** Time to open the marks window for this student (after the name has been shown, or when the teacher taps the button). */
  onContinue: (studentId: string) => void;
  notice?: string;
  pickedCount: number;
  eligibleCount: number;
  onResetRound: () => void;
}

/**
 * "Wheel of names" — the animated version of Random pick. It follows exactly
 * the same rules (only present/late students, nobody twice per round, the
 * winner is decided first and the wheel is then spun to land on them), and
 * once it stops the points window opens for the chosen student.
 */
export default function NamesWheelModal({
  open,
  onClose,
  students,
  eligibleIds,
  onDraw,
  onLanded,
  onContinue,
  notice,
  pickedCount,
  eligibleCount,
  onResetRound,
}: NamesWheelModalProps) {
  const { t } = useTranslation();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the chosen name is on screen waiting to open the marks window.
  const [revealing, setRevealing] = useState(false);

  function stopTicking() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  function clearReveal() {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
    setRevealing(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /** Plays a click every time a segment passes the pointer, by watching the wheel's real on-screen angle. */
  function startTicking(startRotation: number) {
    stopTicking();
    const angleOf = () => {
      const el = wheelRef.current;
      if (!el) return null;
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    };
    let prev = angleOf();
    if (prev === null) return;
    let unwrapped = ((startRotation % 360) + 360) % 360;
    let lastIndex = Math.floor(unwrapped / seg);
    let lastTickAt = 0;
    const loop = () => {
      const cur = angleOf();
      if (cur !== null && prev !== null) {
        let d = cur - prev;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        unwrapped += d;
        prev = cur;
        const idx = Math.floor(unwrapped / seg);
        const now = performance.now();
        if (idx !== lastIndex) {
          lastIndex = idx;
          if (now - lastTickAt > 28) {
            lastTickAt = now;
            playTick();
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  const n = students.length;
  const seg = n > 0 ? 360 / n : 360;

  const segments = useMemo(
    () =>
      students.map((st, i) => {
        const a0 = i * seg;
        const a1 = (i + 1) * seg;
        const mid = (a0 + a1) / 2;
        return { st, a0, a1, mid, fill: colorFor(i, n), ...fitName(st.name, n) };
      }),
    [students, seg, n]
  );

  const winner = winnerId ? students.find((s) => s.id === winnerId) || null : null;

  function spin() {
    if (spinning || n === 0) return;
    unlockSound();
    clearReveal();
    const id = onDraw();
    if (!id) return;
    const index = students.findIndex((s) => s.id === id);
    if (index < 0) return;

    setWinnerId(null);
    const jitter = (Math.random() - 0.5) * seg * 0.7; // lands somewhere inside the wedge, not always dead centre
    const target = -(index * seg + seg / 2 + jitter);
    const delta = (((target - rotation) % 360) + 360) % 360;
    const reduceMotion = prefersReducedMotion();
    const duration = reduceMotion ? 1200 : SPIN_MS;

    setSpinning(true);
    setRotation(rotation + 360 * (reduceMotion ? 1 : EXTRA_TURNS) + delta);
    startTicking(rotation);

    timerRef.current = setTimeout(() => {
      stopTicking();
      setSpinning(false);
      setWinnerId(id);
      playReveal();
      confetti({
        particleCount: 90,
        spread: 75,
        startVelocity: 38,
        origin: { y: 0.55 },
        colors: SEGMENT_COLORS.concat("#ffffff"),
        zIndex: 100,
      });
      landedRef.current(id);
      // Leave the name on screen long enough to be read before the marks window opens.
      setRevealing(true);
      revealTimerRef.current = setTimeout(() => {
        revealTimerRef.current = null;
        setRevealing(false);
        continueRef.current(id);
      }, REVEAL_MS);
    }, duration + 80);
  }

  function handleClose() {
    if (spinning) return; // let the spin finish so the pick is never lost
    clearReveal();
    onClose();
  }

  const winnerSeg = winnerId ? segments.find((s) => s.st.id === winnerId) : undefined;

  return (
    <Modal open={open} onClose={handleClose} title={t("sessions.wheelTitle")} widthClassName="max-w-md">
      <style>{`
        @keyframes nw-pop{0%{transform:scale(.6) rotate(-4deg);opacity:0}70%{transform:scale(1.07) rotate(1deg);opacity:1}100%{transform:scale(1) rotate(0)}}
        @keyframes nw-countdown{from{width:100%}to{width:0}}
        .nw-countdown{animation:nw-countdown ${REVEAL_MS}ms linear forwards}
        .nw-pop{animation:nw-pop .4s cubic-bezier(.34,1.56,.64,1)}
        @keyframes nw-tick{from{transform:rotate(-14deg)}to{transform:rotate(6deg)}}
        .nw-ticking{animation:nw-tick .16s ease-in-out infinite alternate}
        @keyframes nw-blink{0%,100%{opacity:1}50%{opacity:.25}}
        .nw-blink-a{animation:nw-blink .45s linear infinite}
        .nw-blink-b{animation:nw-blink .45s linear infinite .225s}
      `}</style>

      {n === 0 ? (
        <p className="text-sm text-cream-600">{t("students.noStudents")}</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-full max-w-[22rem] pt-5">
            <SoundToggle className="absolute right-0 top-0 z-20" />
            {/* Pointer */}
            <svg
              viewBox="0 0 60 64"
              className={`absolute left-1/2 top-0 z-10 h-12 w-12 -translate-x-1/2 drop-shadow-md ${
                spinning ? "nw-ticking" : ""
              }`}
              style={{ transformOrigin: "50% 15%" }}
              aria-hidden="true"
            >
              <path
                d="M8 8 Q30 -2 52 8 Q54 14 48 22 L33 56 Q30 62 27 56 L12 22 Q6 14 8 8 Z"
                fill="#ffc933"
                style={{ stroke: "rgb(var(--color-navy))" }}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <ellipse cx="22" cy="17" rx="7" ry="4" fill="#fff" opacity=".7" />
            </svg>

            {/* Wheel */}
            <div
              ref={wheelRef}
              className="aspect-square w-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning
                  ? `transform ${prefersReducedMotion() ? 1200 : SPIN_MS}ms cubic-bezier(.12,.7,.1,1)`
                  : "none",
              }}
            >
              <svg viewBox="0 0 400 400" className="h-full w-full drop-shadow-lg" role="img" aria-label={t("sessions.wheelTitle")}>
                <defs>
                  <radialGradient id="nw-gloss" cx="35%" cy="28%" r="75%">
                    <stop offset="0%" stopColor="#fff" stopOpacity=".5" />
                    <stop offset="55%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity=".12" />
                  </radialGradient>
                </defs>

                {/* White rim with navy outline */}
                <circle
                  cx={CX}
                  cy={CY}
                  r={RIM_OUTER}
                  fill="#fff"
                  style={{ stroke: "rgb(var(--color-navy))" }}
                  strokeWidth="6"
                />
                <circle cx={CX} cy={CY} r={RADIUS + 6} fill="#ffe08a" style={{ stroke: "rgb(var(--color-navy))" }} strokeWidth="4" />

                {/* Segments */}
                {n === 1 ? (
                  <circle
                    cx={CX}
                    cy={CY}
                    r={RADIUS}
                    fill={eligibleIds.has(segments[0].st.id) ? segments[0].fill : INACTIVE_FILL}
                  />
                ) : (
                  segments.map((s) => {
                    const active = eligibleIds.has(s.st.id);
                    return (
                      <path
                        key={s.st.id}
                        d={wedgePath(s.a0, s.a1)}
                        fill={active ? s.fill : INACTIVE_FILL}
                        style={active ? { stroke: "rgb(var(--color-navy))" } : { stroke: "#fff" }}
                        strokeWidth={active ? 3 : 2}
                        strokeLinejoin="round"
                      />
                    );
                  })
                )}

                {/* Names */}
                {segments.map((s) => {
                  const active = eligibleIds.has(s.st.id);
                  return (
                    <text
                      key={`t-${s.st.id}`}
                      transform={`rotate(${s.mid - 90} ${CX} ${CY})`}
                      x={CX + RADIUS - 12}
                      y={CY}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={s.size}
                      fontWeight={800}
                      fill={active ? "#fff" : INACTIVE_TEXT}
                      stroke={active ? undefined : "none"}
                      style={{
                        fontFamily: "var(--font-sans), Arial, sans-serif",
                        ...(active
                          ? { stroke: "rgb(var(--color-navy))", paintOrder: "stroke", strokeWidth: Math.max(2, s.size * 0.2) }
                          : {}),
                        strokeLinejoin: "round",
                      }}
                    >
                      {s.text}
                    </text>
                  );
                })}

                {/* Gloss + winner highlight */}
                <circle cx={CX} cy={CY} r={RADIUS} fill="url(#nw-gloss)" pointerEvents="none" />
                {winnerSeg && !spinning && n > 1 && (
                  <path
                    d={wedgePath(winnerSeg.a0, winnerSeg.a1)}
                    fill="none"
                    stroke="#ffd23f"
                    strokeWidth="7"
                    strokeLinejoin="round"
                  />
                )}

                {/* Rim lights */}
                {Array.from({ length: LIGHTS }).map((_, i) => {
                  const [x, y] = polar((360 / LIGHTS) * i, (RIM_OUTER + RADIUS + 6) / 2 + 1);
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="4.6"
                      fill={i % 2 ? "#ffc933" : "#ff7a59"}
                      style={{ stroke: "rgb(var(--color-navy))" }}
                      strokeWidth="1.6"
                      className={spinning ? (i % 2 ? "nw-blink-a" : "nw-blink-b") : undefined}
                    />
                  );
                })}
              </svg>
            </div>

            {/* Centre hub = spin button */}
            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              aria-label={t("sessions.wheelSpin")}
              className="absolute left-1/2 top-[calc(50%+0.625rem)] flex h-[21%] w-[21%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-navy bg-gold text-sm font-extrabold text-navy shadow-[0_4px_0_rgb(var(--color-navy-900))] transition active:translate-y-[calc(-50%+3px)] active:shadow-none disabled:opacity-80"
            >
              {t("sessions.wheelGo")}
            </button>
          </div>

          {/* Result */}
          <div className="flex min-h-[3.75rem] w-full items-center justify-center">
            {winner && !spinning ? (
              <div className="nw-pop w-full overflow-hidden rounded-xl2 border-2 border-gold bg-gold-50 shadow-card">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <StudentAvatar photoURL={winner.photoURL} name={winner.name} size={52} />
                  <p className="min-w-0 flex-1 text-lg font-extrabold leading-tight text-navy [overflow-wrap:anywhere]">
                    {t("sessions.wheelWinner", { name: winner.name })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      clearReveal();
                      continueRef.current(winner.id);
                    }}
                    className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                  >
                    {t("sessions.wheelContinue")}
                  </button>
                </div>
                {revealing && (
                  <div className="h-1.5 w-full bg-gold-100">
                    <div className="nw-countdown h-full bg-gold" />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-sm text-cream-600">
                {spinning ? t("sessions.picking") : t("sessions.wheelHint")}
              </p>
            )}
          </div>

          {notice && <p className="text-center text-xs text-red-600">{notice}</p>}

          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            className="btn-gold w-full py-2.5 text-base disabled:opacity-60"
          >
            {spinning ? t("sessions.picking") : t("sessions.wheelSpin")}
          </button>

          <div className="w-full space-y-1 text-center text-xs text-cream-600">
            <p>{t("sessions.wheelGreyHint")}</p>
            {pickedCount > 0 && (
              <p>
                {t("sessions.pickRoundProgress", { picked: pickedCount, total: eligibleCount })}{" "}
                <button
                  type="button"
                  onClick={onResetRound}
                  disabled={spinning}
                  className="inline-flex items-center gap-1 font-semibold text-gold hover:underline disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                  {t("sessions.pickRoundReset")}
                </button>
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
