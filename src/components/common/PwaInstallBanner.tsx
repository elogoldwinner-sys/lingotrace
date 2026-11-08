import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "lingotrace-pwa-dismissed";
// How long the banner stays hidden after the parent taps X / Later.
// Change this one number to make the "cancel for some time" shorter or longer.
const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/* ------------------------------------------------------------------ */
/* Capture `beforeinstallprompt` at module load.                       */
/* Chrome fires it once, early. If we only listened inside a component */
/* that mounts after login, the event would already be gone and the    */
/* banner would never appear.                                          */
/* ------------------------------------------------------------------ */
let stashedPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    stashedPrompt = null;
    promptListeners.forEach((fn) => fn());
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports itself as "Macintosh" but has touch points
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function isDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = parseInt(raw, 10);
    return Number.isFinite(at) && Date.now() - at < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

export default function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(stashedPrompt);
  const [visible, setVisible] = useState(false);
  const ios = typeof window !== "undefined" && isIosDevice();

  useEffect(() => {
    if (isStandalone() || isDismissedRecently()) return;

    // Keep in sync with the module-level listener (covers late/early firing)
    const sync = () => {
      setDeferredPrompt(stashedPrompt);
      if (stashedPrompt && !isDismissedRecently() && !isStandalone()) setVisible(true);
      if (!stashedPrompt && !ios) setVisible(false); // app was installed
    };
    promptListeners.add(sync);

    let timer: number | undefined;
    if (ios) {
      // iOS has no install event: show the "Add to Home Screen" tip after a short delay
      timer = window.setTimeout(() => setVisible(true), 2500);
    } else if (stashedPrompt) {
      setVisible(true);
    }

    return () => {
      promptListeners.delete(sync);
      if (timer) window.clearTimeout(timer);
    };
  }, [ios]);

  function hideForAWhile() {
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      /* private mode: banner will simply come back next visit */
    }
    setVisible(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    stashedPrompt = null; // a prompt event can only be used once
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      // They cancelled the native dialog -> treat like "Later"
      hideForAWhile();
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 inset-x-3 sm:inset-x-auto sm:end-6 z-40 max-w-md">
      <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-navy/95 p-4 text-cream shadow-2xl backdrop-blur-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold">
          <Smartphone size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-serif text-sm font-semibold text-white">
            {t("pwa.installTitle", "Install LingoTrace App")}
          </h4>
          <p className="mt-1 text-xs text-cream-400 leading-relaxed">
            {ios
              ? t(
                  "pwa.iosTip",
                  "To install on iPhone: tap the Share button at the bottom, then select 'Add to Home Screen'"
                )
              : t(
                  "pwa.installDesc",
                  "Add LingoTrace to your home screen for fast fullscreen access."
                )}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {!ios && deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-navy transition hover:opacity-90"
              >
                <Download size={14} />
                <span>{t("pwa.installBtn", "Install App")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={hideForAWhile}
              className="text-xs text-cream-400 hover:text-white px-2 py-1"
            >
              {t("pwa.later", "Later")}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={hideForAWhile}
          className="shrink-0 rounded-lg p-1 text-cream-400 hover:bg-white/10 hover:text-white transition"
          aria-label={t("pwa.dismiss", "Dismiss")}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
