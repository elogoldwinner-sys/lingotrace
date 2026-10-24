import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { toMillis } from "../timestamps";
import type { PointsTransaction } from "../../types";

export type KindFilter = "both" | "gained" | "lost";
export type BucketSize = "day" | "week" | "month";

/** A transaction reduced to what the reports need, with `createdAt` already in epoch ms. */
export interface Txn {
  id: string;
  studentId: string;
  classId: string;
  amount: number;
  reason: PointsTransaction["reason"];
  note: string;
  at: number;
}

export function toTxn(raw: PointsTransaction): Txn {
  return {
    id: raw.id,
    studentId: raw.studentId,
    classId: raw.classId,
    amount: Number(raw.amount) || 0,
    reason: raw.reason,
    note: raw.note || "",
    at: toMillis(raw.createdAt),
  };
}

export interface Period {
  /** "all" = since the very beginning. */
  mode: "all" | "custom";
  startDate: string; // YYYY-MM-DD (custom only)
  endDate: string; // YYYY-MM-DD (custom only)
}

export function periodBounds(p: Period): { startMs: number; endMs: number } {
  if (p.mode === "all") return { startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
  return {
    startMs: new Date(`${p.startDate}T00:00:00`).getTime(),
    endMs: new Date(`${p.endDate}T23:59:59.999`).getTime(),
  };
}

export function isPeriodValid(p: Period): boolean {
  return p.mode === "all" || (!!p.startDate && !!p.endDate && p.startDate <= p.endDate);
}

/** Keeps the transactions inside the period that match the gained / lost / both choice. */
export function filterTxns(txns: Txn[], p: Period, kind: KindFilter): Txn[] {
  const { startMs, endMs } = periodBounds(p);
  return txns
    .filter((t) => t.at >= startMs && t.at <= endMs)
    .filter((t) => (kind === "gained" ? t.amount > 0 : kind === "lost" ? t.amount < 0 : true))
    .sort((a, b) => a.at - b.at);
}

export interface Totals {
  gained: number;
  /** Always a positive number (the size of the deductions). */
  lost: number;
  net: number;
  count: number;
}

export function totalsOf(txns: Txn[]): Totals {
  let gained = 0;
  let lost = 0;
  for (const t of txns) {
    if (t.amount > 0) gained += t.amount;
    else if (t.amount < 0) lost += -t.amount;
  }
  return { gained, lost, net: gained - lost, count: txns.length };
}

export interface Bucket {
  key: number;
  label: string;
  gained: number;
  lost: number;
  net: number;
  cumulative: number;
}

/** Day buckets for up to ~5 weeks, week buckets up to ~7 months, otherwise months. */
export function pickBucketSize(spanDays: number): BucketSize {
  if (spanDays <= 35) return "day";
  if (spanDays <= 210) return "week";
  return "month";
}

/**
 * Groups already-filtered transactions into evenly spaced buckets across the
 * reporting window (empty buckets included, so gaps are visible), with a
 * running total of the net points that the chart's line draws.
 */
export function bucketize(txns: Txn[], p: Period): { size: BucketSize; buckets: Bucket[] } {
  if (txns.length === 0) return { size: "day", buckets: [] };
  const { startMs, endMs } = periodBounds(p);
  const first = p.mode === "all" ? txns[0].at : startMs;
  const lastTxn = txns[txns.length - 1].at;
  const last = p.mode === "all" ? Math.max(lastTxn, Date.now()) : Math.min(endMs, Math.max(Date.now(), lastTxn));
  const span = differenceInCalendarDays(new Date(last), new Date(first)) + 1;
  const size = pickBucketSize(span);

  const floor = (ms: number) =>
    size === "day"
      ? startOfDay(ms)
      : size === "week"
        ? startOfWeek(ms, { weekStartsOn: 0 })
        : startOfMonth(ms);
  const step = (d: Date) => (size === "day" ? addDays(d, 1) : size === "week" ? addWeeks(d, 1) : addMonths(d, 1));
  const label = (d: Date) => (size === "month" ? format(d, "MM/yy") : format(d, "dd/MM"));

  const buckets: Bucket[] = [];
  const index = new Map<number, Bucket>();
  for (let d = floor(first); d.getTime() <= last; d = step(d)) {
    const b: Bucket = { key: d.getTime(), label: label(d), gained: 0, lost: 0, net: 0, cumulative: 0 };
    buckets.push(b);
    index.set(b.key, b);
  }
  for (const t of txns) {
    const b = index.get(floor(t.at).getTime());
    if (!b) continue;
    if (t.amount > 0) b.gained += t.amount;
    else if (t.amount < 0) b.lost += -t.amount;
    b.net = b.gained - b.lost;
  }
  let running = 0;
  for (const b of buckets) {
    running += b.net;
    b.cumulative = running;
  }
  return { size, buckets };
}

export interface ReasonRow {
  reason: PointsTransaction["reason"];
  gained: number;
  lost: number;
}

export function byReason(txns: Txn[]): ReasonRow[] {
  const map = new Map<string, ReasonRow>();
  for (const t of txns) {
    const row = map.get(t.reason) || { reason: t.reason, gained: 0, lost: 0 };
    if (t.amount > 0) row.gained += t.amount;
    else if (t.amount < 0) row.lost += -t.amount;
    map.set(t.reason, row);
  }
  return Array.from(map.values()).sort((a, b) => b.gained + b.lost - (a.gained + a.lost));
}

export function describePeriod(p: Period, firstAt: number | null): string {
  if (p.mode === "custom") return `${p.startDate} → ${p.endDate}`;
  return firstAt ? `${format(new Date(firstAt), "yyyy-MM-dd")} → ${format(new Date(), "yyyy-MM-dd")}` : "";
}
