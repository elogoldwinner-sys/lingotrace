import { useCallback, useEffect, useState } from "react";

/**
 * Click-through from a chart to its details: remembers which day / week / month the reader clicked on a bar or point,
 * then scrolls the matching rows of the detailed statement (marked `data-bucket="<period start ms>"`) into view.
 *
 * Reports are drawn twice (the on-screen preview and the print copy), so the target is looked up in the document and
 * only a row that is actually visible counts — the hidden print copy is ignored. Without a row for that period (e.g. it
 * only holds marks that live in their own section) the jump lands on the statement's heading (`data-detail-head`).
 */
export function useBucketJump() {
  const [selected, setSelected] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const select = useCallback((bucket: { key: number }) => {
    setSelected(bucket.key);
    setTick((n) => n + 1); // clicking the same bar again scrolls again
  }, []);
  const clear = useCallback(() => setSelected(null), []);

  useEffect(() => {
    if (selected === null) return;
    const visible = (el: HTMLElement) => el.getClientRects().length > 0;
    const row = Array.from(document.querySelectorAll<HTMLElement>(`[data-bucket="${selected}"]`)).find(visible);
    const target = row ?? Array.from(document.querySelectorAll<HTMLElement>("[data-detail-head]")).find(visible);
    target?.scrollIntoView({ behavior: "smooth", block: row ? "center" : "start" });
  }, [selected, tick]);

  return { selected, select, clear };
}
