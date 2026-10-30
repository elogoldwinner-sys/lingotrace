import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sidebar mascot with a looping animation. One of six movements is picked at
 * random each time the component mounts (page refresh or fresh login) and then
 * switches to a different one after every 3 loops (never the same twice in a row). The name beneath it always gets a letter wave.
 * All motion is CSS-only (transform/opacity) and is
 * turned off by `prefers-reduced-motion` — see the "Animated sidebar logo"
 * block in index.css.
 */
const VARIANTS = ["float", "hop", "shine", "glow", "jelly", "sparkle"] as const;
export type LogoVariant = (typeof VARIANTS)[number];

/** Text effects for the app name (it rotates through these like the logo does). */
export const NAME_STYLES = ["wave", "jelly", "drop", "shimmer", "neon", "rainbow", "glitch"] as const;
export type NameStyle = (typeof NAME_STYLES)[number];
/** These split the name into letters, which would break joined Arabic script. */
const LETTER_STYLES: readonly string[] = ["wave", "jelly", "drop"];

function pickDifferent<T extends string>(list: readonly T[], storageKey: string): T {
  let last: string | null = null;
  try {
    last = localStorage.getItem(storageKey);
  } catch {
    /* storage can be blocked (private mode) — just pick at random */
  }
  const pool = list.filter((v) => v !== last);
  const choice = pool[Math.floor(Math.random() * pool.length)] ?? list[0];
  try {
    localStorage.setItem(storageKey, choice);
  } catch {
    /* ignore */
  }
  return choice;
}

/** How many times a movement loops before the next one takes over. */
const LOOPS_BEFORE_SWITCH = 6;

/**
 * Picks a logo movement and a name effect on mount (refresh / fresh login) and,
 * via `nextVariant` / `nextNameStyle`, a different one each time the current
 * one has looped 3 times. The two rotate independently.
 */
export function useLogoAnimation() {
  const [variant, setVariant] = useState<LogoVariant>(() => pickDifferent(VARIANTS, "lt-logo-variant"));
  const [nameStyle, setNameStyle] = useState<NameStyle>(() => pickDifferent(NAME_STYLES, "lt-name-style"));
  // pickDifferent compares with what is stored, which is always the effect on screen.
  const nextVariant = useCallback(() => setVariant(pickDifferent(VARIANTS, "lt-logo-variant")), []);
  const nextNameStyle = useCallback(() => setNameStyle(pickDifferent(NAME_STYLES, "lt-name-style")), []);
  return { variant, nextVariant, nameStyle, nextNameStyle };
}

const STAR = "M12 0C13 7 17 11 24 12 17 13 13 17 12 24 11 17 7 13 0 12 7 11 11 7 12 0Z";

export default function AnimatedLogo({
  variant,
  onLoop,
  className = "",
}: {
  variant: LogoVariant;
  /** Called after the movement has looped 3 times (switch to the next one). */
  onLoop?: () => void;
  /** Size comes from the parent via Tailwind width/height classes. */
  className?: string;
}) {
  const src = `${import.meta.env.BASE_URL}logo-256.png`;
  const count = useRef(0);
  useEffect(() => {
    count.current = 0;
  }, [variant]);
  const countLoop = () => {
    count.current += 1;
    if (count.current >= LOOPS_BEFORE_SWITCH) {
      count.current = 0;
      onLoop?.();
    }
  };

  return (
    <span
      className={`lt-stage lt-v-${variant} relative inline-block shrink-0 ${className}`}
      style={{ ["--lt-logo" as string]: `url(${src})` }}
      aria-hidden="true"
    >
      {(variant === "float" || variant === "hop") && <span className="lt-shadow" />}
      {variant === "glow" && <span className="lt-halo" />}
      <img src={src} alt="" draggable={false} className="lt-logo" onAnimationIteration={countLoop} />
      {variant === "shine" && <span className="lt-glint" />}
      {variant === "sparkle" && (
        <>
          {[1, 2, 3, 4].map((n) => (
            <svg key={n} viewBox="0 0 24 24" className={`lt-sp lt-sp${n}`}>
              <path d={STAR} fill="#ffd23f" />
            </svg>
          ))}
          {[1, 2, 3].map((n) => (
            <span key={n} className={`lt-ck lt-ck${n}`}>
              ✓
            </span>
          ))}
        </>
      )}
    </span>
  );
}

/**
 * The app name with one of several text effects. Letter-based effects (wave,
 * jelly, drop) only run in Latin script; in Arabic the letters join, so there
 * the whole word gets a gentle bounce instead. `onLoop` fires after the
 * effect has repeated 3 times.
 */
export function AnimatedName({
  text,
  style,
  isArabic,
  onLoop,
}: {
  text: string;
  style: NameStyle;
  isArabic: boolean;
  onLoop?: () => void;
}) {
  const effect = isArabic && LETTER_STYLES.includes(style) ? "bob" : style;
  const letters = LETTER_STYLES.includes(effect);

  const count = useRef(0);
  useEffect(() => {
    count.current = 0;
  }, [effect]);

  return (
    <span
      className={`lt-name lt-n-${effect}`}
      aria-label={text}
      onAnimationIteration={(e) => {
        // Letter effects fire once per letter; only count the first letter (or the whole word).
        const el = e.currentTarget;
        if (e.target !== el && e.target !== el.firstElementChild) return;
        count.current += 1;
        if (count.current >= LOOPS_BEFORE_SWITCH) {
          count.current = 0;
          onLoop?.();
        }
      }}
    >
      {letters
        ? Array.from(text).map((c, i) => (
            <span key={i} aria-hidden="true" style={{ ["--i" as string]: i }}>
              {c === " " ? "\u00a0" : c}
            </span>
          ))
        : text}
    </span>
  );
}
