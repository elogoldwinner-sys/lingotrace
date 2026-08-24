import type { ReactNode } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import { StudyToolsBadge } from "./decorations";

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, message, action }: EmptyStateProps) {
  const { theme } = useTheme();
  const isKid = theme === "kid";

  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {isKid ? (
        <StudyToolsBadge size={72} />
      ) : (
        icon && <div className="text-3xl">{icon}</div>
      )}
      <p className="text-sm text-cream-600">{message}</p>
      {action}
    </div>
  );
}
