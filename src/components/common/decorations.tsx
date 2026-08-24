/**
 * Original vector illustrations for kid mode — no stock photography or
 * third-party art, so there's nothing to license and no real children are
 * depicted. A friendly owl mascot (a nod to LingoBite's own reading/study
 * theme) plus clouds and study-tool motifs, all drawn with the theme's CSS
 * color variables so they stay in sync with the kid palette automatically.
 */

function v(name: string, alpha = 1) {
  return `rgb(var(--color-${name}) / ${alpha})`;
}

/** Scattered fluffy clouds + stars, meant as an absolutely-positioned
 *  backdrop layer behind hero content. Purely decorative. */
export function CloudLayer({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 300"
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill={v("navy-100")} opacity={0.6}>
        <ellipse cx="90" cy="60" rx="70" ry="34" />
        <ellipse cx="150" cy="45" rx="50" ry="28" />
        <ellipse cx="40" cy="50" rx="40" ry="24" />
      </g>
      <g fill={v("gold-100")} opacity={0.7}>
        <ellipse cx="680" cy="220" rx="80" ry="36" />
        <ellipse cx="740" cy="200" rx="50" ry="26" />
        <ellipse cx="620" cy="210" rx="42" ry="22" />
      </g>
      <g fill={v("navy-200")} opacity={0.35}>
        <ellipse cx="600" cy="50" rx="46" ry="22" />
        <ellipse cx="650" cy="40" rx="34" ry="18" />
      </g>
      <g fill={v("gold-400")} opacity={0.9}>
        <path d="M120 160 l6 14 15 2 -11 10 3 15 -13 -8 -13 8 3 -15 -11 -10 15 -2Z" />
        <path d="M740 90 l4 10 11 1 -8 7 2 11 -9 -6 -9 6 2 -11 -8 -7 11 -1Z" />
        <path d="M40 230 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1Z" />
      </g>
    </svg>
  );
}

/** A friendly reading owl, perched on a stack of books — LingoBite's kid
 *  mode mascot. Keep it simple and rounded so it reads well at small sizes. */
export function StudyMascot({
  size = 96,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
    >
      {/* book stack */}
      <rect x="18" y="96" width="84" height="10" rx="3" fill={v("navy-400")} />
      <rect x="24" y="88" width="72" height="10" rx="3" fill={v("gold-400")} />
      {/* body */}
      <ellipse cx="60" cy="62" rx="34" ry="30" fill={v("navy-500")} />
      {/* belly */}
      <ellipse cx="60" cy="70" rx="20" ry="17" fill={v("cream-100")} />
      {/* wings */}
      <ellipse cx="30" cy="66" rx="10" ry="16" fill={v("navy-600")} />
      <ellipse cx="90" cy="66" rx="10" ry="16" fill={v("navy-600")} />
      {/* ear tufts */}
      <path d="M38 34 L46 18 L52 38 Z" fill={v("navy-500")} />
      <path d="M82 34 L74 18 L68 38 Z" fill={v("navy-500")} />
      {/* face */}
      <circle cx="47" cy="52" r="13" fill="white" />
      <circle cx="73" cy="52" r="13" fill="white" />
      <circle cx="47" cy="52" r="6" fill={v("navy-800")} />
      <circle cx="73" cy="52" r="6" fill={v("navy-800")} />
      <circle cx="49" cy="50" r="2" fill="white" />
      <circle cx="75" cy="50" r="2" fill="white" />
      {/* beak */}
      <path d="M56 62 L64 62 L60 70 Z" fill={v("gold-500")} />
      {/* feet */}
      <path d="M50 92 l-4 8 M50 92 l4 8" stroke={v("gold-500")} strokeWidth="3" strokeLinecap="round" />
      <path d="M70 92 l-4 8 M70 92 l4 8" stroke={v("gold-500")} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Small cluster of study-tool icons (pencil, open book, star) used as a
 *  friendly accent in empty states and hero sections. */
export function StudyToolsBadge({
  size = 72,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      className={className}
      aria-hidden="true"
    >
      <circle cx="36" cy="36" r="34" fill={v("gold-100")} />
      {/* open book */}
      <path
        d="M20 26 Q28 22 36 26 L36 46 Q28 42 20 46 Z"
        fill={v("navy-500")}
      />
      <path
        d="M52 26 Q44 22 36 26 L36 46 Q44 42 52 46 Z"
        fill={v("navy-400")}
      />
      {/* pencil */}
      <g transform="rotate(30 50 20)">
        <rect x="46" y="8" width="8" height="28" rx="2" fill={v("gold-500")} />
        <path d="M46 8 L54 8 L50 0 Z" fill={v("navy-700")} />
      </g>
      {/* star */}
      <path
        d="M22 16 l2.4 5 5.6 0.6 -4.2 3.8 1.2 5.6 -5 -3 -5 3 1.2 -5.6 -4.2 -3.8 5.6 -0.6Z"
        fill={v("gold-500")}
      />
    </svg>
  );
}
