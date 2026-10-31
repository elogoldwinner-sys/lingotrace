/** A multi-series line chart (one line per class / subject / student) in the same plain-SVG style as PointsCharts. */
export const SERIES_COLORS = ["#1e3a8a", "#15803d", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#4d7c0f", "#475569", "#b45309"];

const W = 640;
const INK = "#1f2937";
const MUTED = "#6b7280";
const GRID = "#e5e7eb";

function labelIndices(count: number, max = 8): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i));
  const out = new Set<number>();
  const step = (count - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.add(Math.round(i * step));
  return out;
}

export function MultiLineChart({
  labels,
  series,
  height = 240,
}: {
  labels: string[];
  series: { label: string; color: string; values: number[] }[];
  height?: number;
}) {
  const padL = 40;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const all = series.flatMap((s) => s.values);
  let min = Math.min(...all, 0);
  let max = Math.max(...all, 0);
  if (min === max) max = min + 1;
  const range = max - min;
  min -= range * 0.08;
  max += range * 0.08;
  const plotH = height - padT - padB;
  const plotW = W - padL - padR;
  const n = labels.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + ((max - v) / (max - min)) * plotH;
  const shown = labelIndices(n);
  const ticks = [max, (max + min) / 2, min].map((v) => Math.round(v));

  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <div style={{ minWidth: 520 }}>
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" style={{ direction: "ltr", display: "block" }}>
          {ticks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="0.7" />
              <text x={padL - 5} y={y(v) + 3.5} fontSize="10" fill={MUTED} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {min < 0 && max > 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth="1" />}
          {series.map((s) => (
            <g key={s.label}>
              <path
                d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {n <= 30 && s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.4" fill={s.color} />)}
            </g>
          ))}
          {labels.map((l, i) =>
            shown.has(i) ? (
              <text key={i} x={x(i)} y={height - 8} fontSize="10" fill={MUTED} textAnchor="middle">
                {l}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  );
}
