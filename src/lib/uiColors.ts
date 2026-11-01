/**
 * Unisex colour sets (no pink / baby-blue stereotypes) used to tell buttons and classes apart.
 * Every class name is written out in full so Tailwind can find it.
 */

/** Tinted action buttons: add alongside `btn-secondary`; the `!` overrides its default gold look. */
export const ACTION_TONES = {
  teal: "!border-teal-300 !bg-teal-50 !text-teal-800 hover:!bg-teal-100 !shadow-[0_4px_0_#5eead4]",
  blue: "!border-blue-300 !bg-blue-50 !text-blue-800 hover:!bg-blue-100 !shadow-[0_4px_0_#93c5fd]",
  emerald: "!border-emerald-300 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100 !shadow-[0_4px_0_#6ee7b7]",
  orange: "!border-orange-300 !bg-orange-50 !text-orange-800 hover:!bg-orange-100 !shadow-[0_4px_0_#fdba74]",
  violet: "!border-violet-300 !bg-violet-50 !text-violet-800 hover:!bg-violet-100 !shadow-[0_4px_0_#c4b5fd]",
  amber: "!border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100 !shadow-[0_4px_0_#fcd34d]",
} as const;

/**
 * Toolbar buttons: each gets its own colour (set through the --c variable that `.btn-fx` reads in index.css).
 * No two buttons share a colour or shape. Unisex palette, no pink / baby blue.
 */
export const BTN_TONES = {
  purple: "[--c:#36207C]",
  teal: "[--c:#0F8B8D]",
  ruby: "[--c:#C0264F]",
  blue: "[--c:#2563EB]",
  orange: "[--c:#EA580C]",
  slate: "[--c:#475569]",
} as const;

/** Kept so older imports still work; maps onto the new tones. */
export const SOLID_TONES = BTN_TONES;

/** One look per class: its own colour AND its own marker shape (so a 9th class or a colour-blind viewer can still tell them apart). */
const CLASS_TONES = [
  { color: "#2563EB", shape: "circle" },
  { color: "#0891B2", shape: "square" },
  { color: "#EA580C", shape: "triangle" },
  { color: "#7C3AED", shape: "diamond" },
  { color: "#16A34A", shape: "hexagon" },
  { color: "#CA8A04", shape: "plus" },
  { color: "#DC2626", shape: "down" },
  { color: "#475569", shape: "star" },
];

/** Colour for a class: its rank among the given class ids (sorted), so it's the same on every page. */
export function classTone(classId: string, allClassIds: string[]) {
  const rank = [...allClassIds].sort().indexOf(classId);
  return CLASS_TONES[(rank < 0 ? 0 : rank) % CLASS_TONES.length];
}
