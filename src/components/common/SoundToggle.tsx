import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundMuted, setSoundMuted, subscribeSound, unlockSound } from "../../lib/sounds";

/** Small speaker button that mutes/unmutes the wheel and mark sound effects. */
export default function SoundToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const muted = useSyncExternalStore(subscribeSound, isSoundMuted, () => false);
  const label = muted ? t("sessions.soundOff") : t("sessions.soundOn");
  return (
    <button
      type="button"
      onClick={() => {
        setSoundMuted(!muted);
        if (muted) unlockSound();
      }}
      title={label}
      aria-label={label}
      aria-pressed={!muted}
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-cream-300 bg-white text-cream-700 transition hover:border-gold hover:text-gold ${className}`}
    >
      {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}
