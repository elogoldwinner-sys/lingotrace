import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { markFullscreenSuggested, useFullscreenMode, wasFullscreenSuggested } from "../../lib/fullscreen";

/** Once per login: suggests full-screen mode (a browser needs a click to go full screen, so this is a button, not automatic). */
export default function FullscreenSuggestion() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { immersive, enter } = useFullscreenMode();
  const [show, setShow] = useState(false);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid || immersive || wasFullscreenSuggested(uid)) return;
    const id = window.setTimeout(() => setShow(true), 1500);
    return () => window.clearTimeout(id);
  }, [uid, immersive]);

  if (!show || immersive || !uid) return null;

  function close() {
    if (uid) markFullscreenSuggested(uid);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label={t("fs.suggestTitle", "Try full-screen mode")}
      className="fixed end-3 top-24 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-navy-100 bg-white p-4 shadow-[0_18px_40px_-16px_rgba(59,34,135,0.55)] print:hidden"
    >
      <button type="button" onClick={close} aria-label={t("common.close", "Close")} className="absolute end-2 top-2 rounded-full p-1 text-cream-600 hover:bg-navy-50">
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pe-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-100 text-navy-700">
          <Maximize2 size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-base font-bold text-navy-700">{t("fs.suggestTitle", "Try full-screen mode")}</p>
          <p className="mt-1 text-sm text-cream-600">
            {t("fs.suggestBody", "Hide the browser bars and move the menu to a bottom bar to get more room for your work.")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-full px-3 py-1.5 text-sm font-bold text-cream-600 hover:bg-navy-50">
          {t("fs.notNow", "Not now")}
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            void enter();
          }}
          className="rounded-full bg-navy-700 px-4 py-1.5 text-sm font-bold text-white shadow-[0_4px_0_#2a1860] transition hover:-translate-y-0.5"
        >
          {t("fs.enter", "Full screen")}
        </button>
      </div>
    </div>
  );
}
