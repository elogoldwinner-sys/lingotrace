import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFullscreenMode } from "../../lib/fullscreen";

/** Header button: enters/leaves full-screen mode (the side menu becomes a bottom bar while it's on). */
export default function FullscreenButton({ className = "", iconSize = 17 }: { className?: string; iconSize?: number }) {
  const { t } = useTranslation();
  const { immersive, toggle } = useFullscreenMode();
  const label = immersive ? t("nav.exitFullscreen", "Exit full screen") : t("nav.fullscreen", "Full screen");
  return (
    <button type="button" onClick={() => void toggle()} className={className} title={label} aria-label={label} aria-pressed={immersive}>
      {immersive ? <Minimize2 size={iconSize} /> : <Maximize2 size={iconSize} />}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
