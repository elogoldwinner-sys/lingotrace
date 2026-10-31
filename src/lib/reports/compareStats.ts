import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { filterTxns, periodBounds, pickBucketSize, totalsOf, type BucketSize, type KindFilter, type Period, type Totals, type Txn } from "./pointsStats";

export interface SeriesInput {
  id: string;
  label: string;
  txns: Txn[];
}

export interface SeriesResult {
  id: string;
  label: string;
  totals: Totals;
  /** Running net total at the end of every bucket (aligned with `labels`). */
  cumulative: number[];
}

/**
 * Puts several groups (classes, subjects or students) on ONE shared time axis
 * so their running totals can be drawn as lines on the same chart.
 */
export function compareSeries(input: SeriesInput[], period: Period, kind: KindFilter): {
  size: BucketSize;
  labels: string[];
  series: SeriesResult[];
} {
  const filtered = input.map((s) => ({ ...s, txns: filterTxns(s.txns, period, kind) }));
  const all = filtered.flatMap((s) => s.txns);
  const series: SeriesResult[] = filtered.map((s) => ({ id: s.id, label: s.label, totals: totalsOf(s.txns), cumulative: [] }));
  if (all.length === 0) return { size: "day", labels: [], series };

  const { startMs, endMs } = periodBounds(period);
  const first = period.mode === "all" ? Math.min(...all.map((x) => x.at)) : startMs;
  const lastTxn = Math.max(...all.map((x) => x.at));
  const last = period.mode === "all" ? Math.max(lastTxn, Date.now()) : Math.min(endMs, Math.max(Date.now(), lastTxn));
  const span = differenceInCalendarDays(new Date(last), new Date(first)) + 1;
  const size = pickBucketSize(span);
  const floor = (ms: number) =>
    size === "day" ? startOfDay(ms) : size === "week" ? startOfWeek(ms, { weekStartsOn: 0 }) : startOfMonth(ms);
  const step = (d: Date) => (size === "day" ? addDays(d, 1) : size === "week" ? addWeeks(d, 1) : addMonths(d, 1));

  const keys: number[] = [];
  const labels: string[] = [];
  for (let d = floor(first); d.getTime() <= last; d = step(d)) {
    keys.push(d.getTime());
    labels.push(size === "month" ? format(d, "MM/yy") : format(d, "dd/MM"));
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  filtered.forEach((s, si) => {
    const net = new Array(keys.length).fill(0);
    for (const t of s.txns) {
      const i = index.get(floor(t.at).getTime());
      if (i != null) net[i] += t.amount;
    }
    let run = 0;
    series[si].cumulative = net.map((n) => (run += n));
  });
  return { size, labels, series };
}
