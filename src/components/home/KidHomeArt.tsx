/**
 * Small SVG pieces used by the kid-mode homepage (see KidHome.tsx): rounded
 * stars, the yellow "spark" rays, cloud banks, the purple hill behind the
 * globe, the two portal-card icons and the corner blobs inside the cards.
 * Everything here is decorative (aria-hidden) and carries no text.
 */

/** Lavender sky shared by the kid-mode pages (home, teacher portal, …). */
export const KID_SKY_BACKGROUND = [
  "radial-gradient(48% 44% at 50% 52%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 100%)",
  "radial-gradient(60% 34% at 50% -8%, #BDB5FD 0%, rgba(189,181,253,0) 100%)",
  "radial-gradient(38% 42% at 0% 0%, #B3AAFC 0%, rgba(179,170,252,0) 100%)",
  "radial-gradient(38% 42% at 100% 0%, #B8B0FD 0%, rgba(184,176,253,0) 100%)",
  "linear-gradient(180deg, #E4E0FE 0%, #F4F2FE 38%, #F1EFFD 72%, #E2DDFD 100%)",
].join(", ");

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const STAR_OUTER = starPoints(50, 52, 36, 17);
const STAR_SHINE = starPoints(48, 48, 22, 10);

/** Chubby, rounded five-point star in sunny orange. */
export function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon
        points={STAR_OUTER}
        fill="#FFB020"
        stroke="#FFB020"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <polygon
        points={STAR_SHINE}
        fill="#FFC94D"
        stroke="#FFC94D"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Three short yellow rays fanning out to the LEFT. Pass `flip` for the right
 * hand side. Place it with physical left/right utilities (not start/end) so
 * the pair stays symmetrical when the page is switched to Arabic (RTL).
 */
export function Sparks({ className = "", flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 22 64"
      className={`${flip ? "-scale-x-100" : ""} ${className}`}
      aria-hidden="true"
      fill="none"
      stroke="#FFB020"
      strokeWidth="5"
      strokeLinecap="round"
    >
      <path d="M4 8 L17 18" />
      <path d="M3 32 H19" />
      <path d="M4 56 L17 46" />
    </svg>
  );
}

type Puff = readonly [cx: number, cy: number, r: number];

/** A cloud = union of circles + a flat base, drawn twice (lavender rim, white body). */
function CloudShape({
  puffs,
  width,
  height,
  baseY,
  className = "",
  body = "#FFFFFF",
  rim = "#DFD8FE",
}: {
  puffs: readonly Puff[];
  width: number;
  height: number;
  baseY: number;
  className?: string;
  body?: string;
  rim?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax meet"
    >
      <g fill={rim}>
        {puffs.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y - 3} r={r + 3} />
        ))}
        <rect x={width * 0.07} y={baseY - 3} width={width * 0.86} height={height - baseY + 3} />
      </g>
      <g fill={body}>
        {puffs.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
        <rect x={width * 0.07} y={baseY} width={width * 0.86} height={height - baseY} />
      </g>
    </svg>
  );
}

const LEFT_PUFFS: readonly Puff[] = [
  [62, 96, 46],
  [140, 70, 56],
  [232, 58, 54],
  [326, 70, 58],
  [412, 90, 50],
  [488, 104, 40],
];
const RIGHT_PUFFS: readonly Puff[] = [
  [70, 104, 40],
  [146, 90, 50],
  [232, 68, 58],
  [326, 58, 54],
  [418, 70, 56],
  [498, 96, 46],
];

/** Cloud the boy peeks over (covers the bottom edge of his cut-out). */
export function CloudLeft({ className = "" }: { className?: string }) {
  return <CloudShape puffs={LEFT_PUFFS} width={540} height={170} baseY={110} className={className} />;
}

/** Cloud the girl peeks over. */
export function CloudRight({ className = "" }: { className?: string }) {
  return <CloudShape puffs={RIGHT_PUFFS} width={540} height={170} baseY={110} className={className} />;
}

/** Wide cloud floor along the bottom edge of the page. */
export function CloudFloor({ className = "" }: { className?: string }) {
  const back: readonly Puff[] = [
    [80, 128, 60],
    [230, 112, 74],
    [400, 124, 66],
    [560, 108, 78],
    [730, 122, 70],
    [890, 110, 76],
    [1050, 124, 66],
    [1210, 112, 74],
    [1370, 126, 62],
  ];
  const front: readonly Puff[] = [
    [250, 150, 56],
    [330, 138, 50],
    [640, 156, 54],
    [1090, 152, 58],
    [1170, 142, 48],
  ];
  return (
    <svg
      viewBox="0 0 1440 180"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax slice"
    >
      <g fill="#D3CCFC">
        {back.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
        <rect x="0" y="130" width="1440" height="50" />
      </g>
      <g fill="#EEEBFF">
        {front.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} />
        ))}
        <rect x="0" y="166" width="1440" height="14" />
      </g>
    </svg>
  );
}

/** Big purple cloud-hill that sits behind the globe (bottom-right). */
export function PurpleHill({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 520" className={className} aria-hidden="true" preserveAspectRatio="xMaxYMax meet">
      <defs>
        <linearGradient id="kidHillFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9A7DF6" />
          <stop offset="1" stopColor="#7350E6" />
        </linearGradient>
      </defs>
      <g fill="url(#kidHillFill)">
        <circle cx="390" cy="270" r="170" />
        <circle cx="230" cy="420" r="120" />
        <circle cx="440" cy="440" r="110" />
      </g>
    </svg>
  );
}

/** Corner blob for the portal cards. Drawn for the top-left corner; rotate to reuse. */
export function CardBlob({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" fill="currentColor">
      <path d="M0 0 H88 C90 20 64 24 54 42 C45 58 54 76 34 83 C20 88 6 80 0 68 Z" />
    </svg>
  );
}

/** Mortarboard line-icon for the Teacher portal (drawn in the accent orange). */
export function CapIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="#FFB020"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M24 9 L42 18.5 L24 28 L6 18.5 Z" />
      <path d="M13 24 V31.5 C13 34.5 18 37.5 24 37.5 C30 37.5 35 34.5 35 31.5 V24" />
      <path d="M39 22 V30" />
      <circle cx="39" cy="32.5" r="1.6" fill="#FFB020" />
      <circle cx="24" cy="18.5" r="1.3" fill="#FFB020" />
    </svg>
  );
}

/** Ribbon-heart line-icon for the Parent portal. */
export function HeartRibbonIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="#FF9A00"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M24 34.5 L12.6 22.4 C8.6 18 10.6 11 17 10.6 C20.6 10.4 22.9 12.6 24 15.2 C25.1 12.6 27.4 10.4 31 10.6 C37.4 11 39.4 18 35.4 22.4 Z" />
      <path d="M21 17.5 L24 20.5 L27 17.5" strokeWidth="2.6" />
      <path d="M24 34.5 L13 40" />
      <path d="M26.5 35.5 L34 40.5" strokeWidth="2.8" />
    </svg>
  );
}
