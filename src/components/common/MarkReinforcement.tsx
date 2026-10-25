import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import confetti from "canvas-confetti";
import { playGain, playLoss } from "../../lib/sounds";

export interface MarkReinforcementEvent {
  /** Changes on every save so the animation replays even for the same amount. */
  id: number;
  /** Marks just saved: positive = added, negative = deducted. */
  amount: number;
}

const DURATION_MS = 2000;

interface Tier {
  key: string;
  color: string;
}

/** Which word to show for a saved amount. */
function tierFor(amount: number): Tier {
  const size = Math.abs(amount);
  if (amount > 0) {
    if (size >= 5) return { key: "amazing", color: "#ff6fb1" };
    if (size >= 3) return { key: "perfect", color: "#ffc933" };
    if (size === 2) return { key: "great", color: "#34d399" };
    return { key: "good", color: "#38a8ff" };
  }
  if (size >= 4) return { key: "improve", color: "#a78bfa" };
  if (size >= 2) return { key: "careful", color: "#ff7a59" };
  return { key: "oops", color: "#ff7a59" };
}

const STAR_COUNT = 12;
const STAR_PATH = "M12 1.5l3.2 6.9 7.5.9-5.5 5.2 1.5 7.4L12 18l-6.7 3.9 1.5-7.4L1.3 9.3l7.5-.9z";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Written reinforcement shown in the middle of the screen right after the
 * teacher clicks Save on a mark. Added marks: the word (Good! / Great! /
 * Perfect! / Amazing!) blows up with stars and confetti, then fades. Deducted
 * marks: the word (Oops! / Careful! / Let's improve!) drops in and the amount
 * falls and fades away. It ignores clicks, so it never blocks the teacher.
 */
export default function MarkReinforcement({
  event,
  onDone,
}: {
  event: MarkReinforcementEvent | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!event) return;
    if (event.amount > 0) playGain(event.amount);
    else if (event.amount < 0) playLoss();
    if (event.amount > 0 && !reducedMotion()) {
      confetti({
        particleCount: 70,
        spread: 360,
        startVelocity: 32,
        ticks: 70,
        scalar: 1.15,
        shapes: ["star", "circle"],
        colors: ["#ffc933", "#38a8ff", "#ff6fb1", "#34d399", "#ffffff"],
        origin: { x: 0.5, y: 0.45 },
        zIndex: 120,
      });
    }
    const timer = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(timer);
    // The animation is tied to this save only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  if (!event || event.amount === 0) return null;

  const positive = event.amount > 0;
  const tier = tierFor(event.amount);
  const word = t(`sessions.reinforce.${tier.key}`);
  const amountText = positive ? `+${event.amount}` : `−${Math.abs(event.amount)}`;
  const long = word.length > 9;

  const outline = {
    WebkitTextStroke: "10px rgb(var(--color-navy))",
    paintOrder: "stroke fill",
    strokeLinejoin: "round",
    textShadow: "0 7px 0 rgb(var(--color-navy-900))",
    fontFamily: '"Baloo 2", var(--font-serif), "Nunito", Arial, sans-serif',
    fontWeight: 800,
    lineHeight: 1,
  } as const;

  return createPortal(
    <div
      key={event.id}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center overflow-hidden"
    >
      <style>{`
        @keyframes mr-burst{0%{transform:scale(.1) rotate(-14deg);opacity:0}30%{transform:scale(1.35) rotate(5deg);opacity:1}48%{transform:scale(.95) rotate(-3deg)}62%{transform:scale(1.04) rotate(0)}82%{transform:scale(1) rotate(0);opacity:1}100%{transform:scale(1.08) translateY(-46px);opacity:0}}
        @keyframes mr-drop{0%{transform:translateY(-130px) scale(1.25);opacity:0}24%{transform:translateY(0) scale(1);opacity:1}32%{transform:translateX(-10px) rotate(-2deg)}40%{transform:translateX(9px) rotate(2deg)}48%{transform:translateX(-5px)}56%{transform:translateX(0)}80%{opacity:1}100%{transform:translateY(40px) scale(.96);opacity:0}}
        @keyframes mr-rise{0%{transform:translateY(10px) scale(.2);opacity:0}30%{transform:translateY(0) scale(1.25);opacity:1}45%{transform:scale(1)}80%{opacity:1}100%{transform:translateY(-60px);opacity:0}}
        @keyframes mr-fall{0%{transform:translateY(-24px) scale(.5);opacity:0}22%{transform:translateY(0) scale(1.1);opacity:1}45%{opacity:1}100%{transform:translateY(190px) rotate(8deg) scale(.9);opacity:0}}
        @keyframes mr-star{0%{transform:translate(0,0) scale(0) rotate(0);opacity:0}25%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(1) rotate(var(--rot));opacity:0}}
        @keyframes mr-fade{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0}}
        .mr-word{animation:mr-burst ${DURATION_MS}ms cubic-bezier(.34,1.3,.5,1) both}
        .mr-word-down{animation:mr-drop ${DURATION_MS}ms cubic-bezier(.3,1.2,.5,1) both}
        .mr-amount-up{animation:mr-rise ${DURATION_MS}ms ease-out both}
        .mr-amount-down{animation:mr-fall ${DURATION_MS}ms cubic-bezier(.5,0,.8,.6) both}
        .mr-star{animation:mr-star 1.15s ease-out both}
        @media (prefers-reduced-motion: reduce){
          .mr-word,.mr-word-down,.mr-amount-up,.mr-amount-down{animation:mr-fade ${DURATION_MS}ms linear both}
          .mr-star{display:none}
        }
      `}</style>

      <div className="relative flex flex-col items-center px-4 text-center">
        {positive &&
          Array.from({ length: STAR_COUNT }).map((_, i) => {
            const angle = (360 / STAR_COUNT) * i + (i % 2 ? 8 : -8);
            const dist = 170 + (i % 3) * 45;
            const rad = (angle * Math.PI) / 180;
            const dx = Math.round(Math.cos(rad) * dist);
            const dy = Math.round(Math.sin(rad) * dist * 0.75);
            const colors = ["#ffc933", "#ffffff", tier.color];
            return (
              <svg
                key={i}
                viewBox="0 0 24 24"
                className="mr-star absolute left-1/2 top-1/2 -ml-4 -mt-4 h-8 w-8"
                style={
                  {
                    "--dx": `${dx}px`,
                    "--dy": `${dy}px`,
                    "--rot": `${i % 2 ? 90 : -90}deg`,
                    animationDelay: `${120 + (i % 4) * 40}ms`,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                <path
                  d={STAR_PATH}
                  fill={colors[i % colors.length]}
                  style={{ stroke: "rgb(var(--color-navy))" }}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            );
          })}

        <p
          className={positive ? "mr-word" : "mr-word-down"}
          style={{
            ...outline,
            color: tier.color,
            fontSize: long ? "clamp(2.4rem, 10vw, 5rem)" : "clamp(3.4rem, 15vw, 7.5rem)",
          }}
        >
          {word}
        </p>

        <p
          className={positive ? "mr-amount-up" : "mr-amount-down"}
          style={{
            ...outline,
            WebkitTextStroke: "8px rgb(var(--color-navy))",
            color: positive ? "#34d399" : "#ff5a4d",
            fontSize: "clamp(2.6rem, 11vw, 5rem)",
            marginTop: "0.4rem",
            animationDelay: positive ? "180ms" : "120ms",
          }}
        >
          {amountText}
        </p>
      </div>
    </div>,
    document.body
  );
}
