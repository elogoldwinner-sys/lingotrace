import type { ClassRecord } from "../../types";

interface ClassSelectorProps {
  classes: ClassRecord[];
  selectedClassId: string;
  onSelect: (classId: string) => void;
}

/** Row of tappable class buttons (instead of a <select> dropdown), used across Sessions/Students/Notes/Attendance. */
export default function ClassSelector({ classes, selectedClassId, onSelect }: ClassSelectorProps) {
  if (classes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {classes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            selectedClassId === c.id
              ? "bg-navy text-cream-100"
              : "bg-white text-navy border border-cream-400 hover:bg-cream-300"
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
