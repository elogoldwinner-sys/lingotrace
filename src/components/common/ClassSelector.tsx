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
            onClick={() => onSelect(c.id)}
            className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-colors ${
              active ? tone.active : `bg-white ${tone.idle}`
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-white" : tone.dot}`} />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
