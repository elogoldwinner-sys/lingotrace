import type { CSSProperties } from "react";
import type { ClassRecord } from "../../types";
import { classTone } from "../../lib/uiColors";

interface ClassSelectorProps {
  classes: ClassRecord[];
  selectedClassId: string;
  onSelect: (classId: string) => void;
}

/** Row of tappable class buttons, each class with its own colour (same colour on every page). */
export default function ClassSelector({ classes, selectedClassId, onSelect }: ClassSelectorProps) {
  if (classes.length === 0) return null;
  const ids = classes.map((c) => c.id);
  return (
    <div className="flex flex-wrap gap-2">
      {classes.map((c) => {
        const tone = classTone(c.id, ids);
        const active = selectedClassId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(c.id)}
            style={{ "--c": tone.color } as CSSProperties}
            className="cls-fx"
          >
            <i className={`cls-mark cls-mark-${tone.shape}`} />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
