import { useState } from "react";

/**
 * Sidebar mascot with a looping animation. One of six movements is picked at
 * random each time the component mounts (page refresh or fresh login), never
 * the same one as last time. The name beneath it always gets a letter wave.
 * All motion is CSS-only (transform/opacity) and is
 * turned off by `prefers-reduced-motion` — see the "Animated sidebar logo"
 * block in index.css.
 */
const VARIANTS = ["float", "hop", "shine", "glow", "jelly", "sparkle"] as const;
export type LogoVariant = (typeof VARIANTS)[number];

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

/** Picks this visit's movement once per mount (refresh / fresh login), never repeating the last one. */
export function useLogoAnimation() {
  const [variant] = useState<LogoVariant>(() => pickDifferent(VARIANTS, "lt-logo-variant"));
  return { variant };
}

const STAR = "M12 0C13 7 17 11 24 12 17 13 13 17 12 24 11 17 7 13 0 12 7 11 11 7 12 0Z";

export default function AnimatedLogo({
  variant,
  className = "",
}: {
  variant: LogoVariant;
  /** Size comes from the parent via Tailwind width/height classes. */
  className?: string;
}) {
  const src = `${import.meta.env.BASE_URL}logo-256.png`;

  return (
    <span
      className={`lt-stage lt-v-${variant} relative inline-block shrink-0 ${className}`}
      style={{ ["--lt-logo" as string]: `url(${src})` }}
      aria-hidden="true"
    >
      {(variant === "float" || variant === "hop") && <span className="lt-shadow" />}
      {variant === "glow" && <span className="lt-halo" />}
      <img src={src} alt="" draggable={false} className="lt-logo" />
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
 * The app name with a letter-by-letter wave. In Arabic the letters join, so
 * splitting them into separate elements would break the word; there the whole
 * word gets the same gentle bounce instead.
 */
export function AnimatedName({ text, isArabic }: { text: string; isArabic: boolean }) {
  if (isArabic) return <span className="lt-name lt-name-bob">{text}</span>;
  return (
    <span className="lt-name lt-name-wave" aria-label={text}>
      {Array.from(text).map((c, i) => (
        <span key={i} aria-hidden="true" style={{ ["--i" as string]: i }}>
          {c}
        </span>
      ))}
    </span>
  );
}
