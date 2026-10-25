import type { ReactNode } from "react";

export type PodiumRank = 1 | 2 | 3 | undefined;

const RINGS: Record<number, { bg: string; label: string }> = {
  1: { bg: "linear-gradient(135deg,#fde68a 0%,#d4a017 45%,#fff3b0 70%,#b8860b 100%)", label: "🥇" },
  2: { bg: "linear-gradient(135deg,#f3f4f6 0%,#9ca3af 45%,#ffffff 70%,#6b7280 100%)", label: "🥈" },
  3: { bg: "linear-gradient(135deg,#f0b27a 0%,#a8672d 45%,#f5cba0 70%,#7c4a1d 100%)", label: "🥉" },
};
const NORMAL_RING = "linear-gradient(135deg,#e5e7eb,#d1d5db)";

/**
 * A round student picture with a ring that shows the champions-board place:
 * gold (1st), silver (2nd), bronze (3rd), or a plain light ring for everyone else.
 */
export default function StudentAvatar({
  photoURL,
  name,
  size = 48,
  rank,
  fallback,
  title,
  className = "",
}: {
  photoURL?: string;
  name: string;
  size?: number;
  rank?: PodiumRank;
  fallback?: ReactNode;
  title?: string;
  className?: string;
}) {
  const ring = Math.max(2, Math.round(size * 0.07));
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        padding: ring,
        background: rank ? RINGS[rank].bg : NORMAL_RING,
        boxShadow: rank ? "0 1px 4px rgba(0,0,0,.25)" : undefined,
      }}
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white text-navy">
        {photoURL ? (
          <img src={photoURL} alt={name} className="h-full w-full object-cover" />
        ) : (
          fallback ?? <span className="font-semibold" style={{ fontSize: size * 0.4 }}>{name[0]?.toUpperCase()}</span>
        )}
      </span>
    </span>
  );
}

/** Same, over several class boards (a parent may have children in different classes). */
export function rankInAny(
  rankings: Parameters<typeof rankOf>[0][] | undefined,
  studentId: string
): PodiumRank {
  for (const r of rankings || []) {
    const found = rankOf(r, studentId);
    if (found) return found;
  }
  return undefined;
}

/** Rank (1–3) of a student on a class's champions board, if they are on it. */
export function rankOf(
  ranking: { positions?: { rank: 1 | 2 | 3; entries: { studentId: string }[] }[] } | null | undefined,
  studentId: string
): PodiumRank {
  for (const p of ranking?.positions || []) {
    if (p.entries.some((e) => e.studentId === studentId)) return p.rank;
  }
  return undefined;
}
