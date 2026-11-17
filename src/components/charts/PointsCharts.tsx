/**
 * Small dependency-free SVG charts for the points reports. They use fixed
 * hex colours (not theme variables) so they look the same on screen, in
 * either theme, and on paper. Chart internals are always laid out
 * left-to-right, even in Arabic, so axes and bars never mirror.
 */
import type { Bucket } from "../../lib/reports/pointsStats";

export const GAINED = "#15803d";
export const LOST = "#dc2626";
const INK = "#1f2937";
const MUTED = "#6b7280";
const GRID = "#e5e7eb";
const LINE = "#1e3a8a";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Evenly spaced subset of indices so the x-axis labels never overlap. */
function labelIndices(count: number, max = 8): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i));
  const out = new Set<number>();
  const step = (count - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.add(Math.round(i * step));
  return out;
}

const W = 640;

/** On a phone the chart keeps a readable minimum width and scrolls sideways inside its own box. */
function ChartBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <div style={{ minWidth: 520 }}>{children}</div>
    </div>
  );
}

/** Green bars up (points gained) and red bars down (points lost) for each day / week / month. */
export function GainedLostBars({
  buckets,
  height = 230,
  onSelect,
  selectedKey,
}: {
  buckets: Bucket[];
  height?: number;
  /** When given, every bar becomes clickable (and keyboard-focusable): the report jumps to that period's entries. */
  onSelect?: (b: Bucket) => void;
  selectedKey?: number | null;
}) {
  const padL = 36;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const maxUp = niceMax(Math.max(...buckets.map((b) => b.gained), 0));
  const maxDown = Math.max(...buckets.map((b) => b.lost), 0);
  const down = maxDown > 0 ? niceMax(maxDown) : 0;
  const total = maxUp + down;
  const plotH = height - padT - padB;
  const plotW = W - padL - padR;
  const y = (v: number) => padT + ((maxUp - v) / total) * plotH;
  const zero = y(0);
  const slot = plotW / buckets.length;
  const barW = Math.max(2, Math.min(28, slot * 0.7));
  const labels = labelIndices(buckets.length);

  return (
    <ChartBox>
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role={onSelect ? "group" : "img"} style={{ direction: "ltr", display: "block" }}>
      {buckets.map((b, i) =>
        selectedKey === b.key ? <rect key={`sel-${b.key}`} x={padL + slot * i} y={padT} width={slot} height={plotH} fill="#fef3c7" /> : null
      )}
      {[maxUp, maxUp / 2, 0, ...(down ? [-down / 2, -down] : [])].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? INK : GRID} strokeWidth={v === 0 ? 1 : 0.7} />
          <text x={padL - 5} y={y(v) + 3.5} fontSize="10" fill={MUTED} textAnchor="end">
            {Number.isInteger(v) ? v : v.toFixed(1)}
          </text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const cx = padL + slot * i + slot / 2;
        return (
          <g key={b.key}>
            {b.gained > 0 && <rect x={cx - barW / 2} y={y(b.gained)} width={barW} height={zero - y(b.gained)} fill={GAINED} rx="1.5" />}
            {b.lost > 0 && <rect x={cx - barW / 2} y={zero} width={barW} height={y(-b.lost) - zero} fill={LOST} rx="1.5" />}
            {labels.has(i) && (
              <text x={cx} y={height - 8} fontSize="10" fill={MUTED} textAnchor="middle">
                {b.label}
              </text>
            )}
            {onSelect && (b.gained > 0 || b.lost > 0) && (
              <HitArea x={padL + slot * i} y={padT} width={slot} height={plotH} bucket={b} onSelect={onSelect} />
            )}
          </g>
        );
      })}
    </svg>
    </ChartBox>
  );
}

/** Invisible full-height click target over one period: mouse, touch and keyboard (Enter / Space). */
function HitArea({ x, y, width, height, bucket, onSelect }: { x: number; y: number; width: number; height: number; bucket: Bucket; onSelect: (b: Bucket) => void }) {
  const text = `${bucket.label}: +${bucket.gained} / −${bucket.lost}`;
  return (
    <rect
      className="lt-hit"
      x={x}
      y={y}
      width={width}
      height={height}
      tabIndex={0}
      role="button"
      aria-label={text}
      onClick={() => onSelect(bucket)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(bucket);
        }
      }}
    >
      <title>{text}</title>
    </rect>
  );
}

/**
 * Net points (gained minus lost) for each day / week / month ON ITS OWN — every period starts from zero
 * instead of adding the earlier periods, so the line rises and falls with how the student actually did.
 * Dots are green above zero and red below it.
 */
export function RunningTotalLine({
  buckets,
  height = 200,
  onSelect,
  selectedKey,
}: {
  buckets: Bucket[];
  height?: number;
  /** When given, every point becomes clickable (and keyboard-focusable): the report jumps to that period's entries. */
  onSelect?: (b: Bucket) => void;
  selectedKey?: number | null;
}) {
  const padL = 36;
  const padR = 14;
  const padT = 14;
  const padB = 26;
  const values = buckets.map((b) => b.net);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) max = min + 1;
  const range = max - min;
  min -= range * 0.08;
  max += range * 0.08;
  const plotH = height - padT - padB;
  const plotW = W - padL - padR;
  const x = (i: number) => padL + (buckets.length === 1 ? plotW / 2 : (plotW * i) / (buckets.length - 1));
  const y = (v: number) => padT + ((max - v) / (max - min)) * plotH;
  const labels = labelIndices(buckets.length);
  const path = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.net).toFixed(1)}`).join(" ");
  const ticks = [max, (max + min) / 2, min].map((v) => Math.round(v));

  return (
    <ChartBox>
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role={onSelect ? "group" : "img"} style={{ direction: "ltr", display: "block" }}>
      {buckets.map((b, i) => {
        if (selectedKey !== b.key) return null;
        const half = buckets.length === 1 ? plotW / 2 : plotW / (buckets.length - 1) / 2;
        const left = Math.max(padL, x(i) - half);
        const right = Math.min(W - padR, x(i) + half);
        return <rect key={`sel-${b.key}`} x={left} y={padT} width={right - left} height={plotH} fill="#fef3c7" />;
      })}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="0.7" />
          <text x={padL - 5} y={y(v) + 3.5} fontSize="10" fill={MUTED} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {min < 0 && max > 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth="1" />}
      <path d={path} fill="none" stroke={LINE} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {buckets.map((b, i) => (
        <g key={b.key}>
          {buckets.length <= 40 && <circle cx={x(i)} cy={y(b.net)} r="3" fill={b.net < 0 ? LOST : b.net > 0 ? GAINED : LINE} />}
          {selectedKey === b.key && <circle cx={x(i)} cy={y(b.net)} r="6" fill="none" stroke="#b45309" strokeWidth="2" />}
          {onSelect && (b.gained > 0 || b.lost > 0) && (() => {
            const half = buckets.length === 1 ? plotW / 2 : plotW / (buckets.length - 1) / 2;
            const left = Math.max(padL, x(i) - half);
            const right = Math.min(W - padR, x(i) + half);
            return <HitArea x={left} y={padT} width={right - left} height={plotH} bucket={b} onSelect={onSelect} />;
          })()}
          {labels.has(i) && (
            <text x={x(i)} y={height - 8} fontSize="10" fill={MUTED} textAnchor="middle">
              {b.label}
            </text>
          )}
        </g>
      ))}
    </svg>
    </ChartBox>
  );
}

export interface CompareRow {
  label: string;
  /** One value per series, in the same order as `series`. */
  values: number[];
  highlight?: boolean;
}

/** Horizontal grouped bars — used to compare students with each other, and classes with each other. */
export function HorizontalBars({
  rows,
  series,
  maxValue,
}: {
  rows: CompareRow[];
  series: { label: string; color: string }[];
  /** Fixed scale, so several charts of the same data (e.g. split across print pages) stay comparable. */
  maxValue?: number;
}) {
  const labelW = 150;
  const padR = 40;
  const rowH = series.length * 13 + 12;
  const height = rows.length * rowH + 8;
  const max = niceMax(maxValue ?? Math.max(...rows.flatMap((r) => r.values), 0));
  const plotW = W - labelW - padR;

  return (
    <ChartBox>
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" style={{ direction: "ltr", display: "block" }}>
      {rows.map((r, i) => {
        const top = 4 + i * rowH;
        return (
          <g key={`${r.label}-${i}`}>
            {r.highlight && <rect x="0" y={top - 2} width={W} height={rowH - 2} fill="#fef3c7" rx="4" />}
            <text x={labelW - 8} y={top + rowH / 2 + 1} fontSize="11.5" fill={INK} fontWeight={r.highlight ? 700 : 400} textAnchor="end">
              {shorten(r.label, 24)}
            </text>
            {r.values.map((v, k) => {
              const w = (Math.max(v, 0) / max) * plotW;
              const by = top + 3 + k * 13;
              return (
                <g key={k}>
                  <rect x={labelW} y={by} width={Math.max(w, v > 0 ? 1.5 : 0)} height="10" fill={series[k].color} rx="2" />
                  <text x={labelW + w + 4} y={by + 8.5} fontSize="10" fill={MUTED}>
                    {Number.isInteger(v) ? v : v.toFixed(1)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      <line x1={labelW} x2={labelW} y1="0" y2={height} stroke={GRID} />
    </svg>
    </ChartBox>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: MUTED }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 11, height: 11, background: it.color, borderRadius: 2, display: "inline-block" }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
