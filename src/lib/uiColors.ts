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

/** Solid (filled) buttons — each a clearly different colour, for the main action row. Use with `btn-secondary`. */
export const SOLID_TONES = {
  teal: "!border-teal-800 !bg-teal-600 !text-white hover:!bg-teal-700 !shadow-[0_4px_0_#115e59]",
  blue: "!border-blue-800 !bg-blue-600 !text-white hover:!bg-blue-700 !shadow-[0_4px_0_#1e40af]",
  orange: "!border-orange-700 !bg-orange-500 !text-white hover:!bg-orange-600 !shadow-[0_4px_0_#c2410c]",
  lime: "!border-lime-800 !bg-lime-700 !text-white hover:!bg-lime-800 !shadow-[0_4px_0_#3f6212]",
} as const;

/** One look per class: tinted outline when idle, solid fill when selected. */
const CLASS_TONES = [
  { idle: "border-blue-300 text-blue-700 hover:bg-blue-50", active: "border-blue-600 bg-blue-600 text-white", dot: "bg-blue-500" },
  { idle: "border-teal-300 text-teal-700 hover:bg-teal-50", active: "border-teal-600 bg-teal-600 text-white", dot: "bg-teal-500" },
  { idle: "border-orange-300 text-orange-700 hover:bg-orange-50", active: "border-orange-600 bg-orange-600 text-white", dot: "bg-orange-500" },
  { idle: "border-violet-300 text-violet-700 hover:bg-violet-50", active: "border-violet-600 bg-violet-600 text-white", dot: "bg-violet-500" },
  { idle: "border-emerald-300 text-emerald-700 hover:bg-emerald-50", active: "border-emerald-600 bg-emerald-600 text-white", dot: "bg-emerald-500" },
  { idle: "border-amber-300 text-amber-700 hover:bg-amber-50", active: "border-amber-600 bg-amber-600 text-white", dot: "bg-amber-500" },
  { idle: "border-cyan-300 text-cyan-700 hover:bg-cyan-50", active: "border-cyan-600 bg-cyan-600 text-white", dot: "bg-cyan-500" },
  { idle: "border-indigo-300 text-indigo-700 hover:bg-indigo-50", active: "border-indigo-600 bg-indigo-600 text-white", dot: "bg-indigo-500" },
  { idle: "border-lime-400 text-lime-800 hover:bg-lime-50", active: "border-lime-600 bg-lime-600 text-white", dot: "bg-lime-500" },
  { idle: "border-slate-300 text-slate-700 hover:bg-slate-50", active: "border-slate-600 bg-slate-600 text-white", dot: "bg-slate-500" },
];

/** Colour for a class: its rank among the given class ids (sorted), so it's the same on every page. */
export function classTone(classId: string, allClassIds: string[]) {
  const rank = [...allClassIds].sort().indexOf(classId);
  return CLASS_TONES[(rank < 0 ? 0 : rank) % CLASS_TONES.length];
}
