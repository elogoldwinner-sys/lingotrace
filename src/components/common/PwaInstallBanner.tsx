import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "lingotrace-pwa-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 1. Check if already installed as standalone PWA
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // 2. Check if recently dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const timeSinceDismiss = Date.now() - parseInt(dismissedAt, 10);
      if (timeSinceDismiss < DISMISS_DURATION_MS) return;
    }

    // 3. Detect iOS Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    if (isIosDevice) {
      setIsIos(true);
      // Wait 3 seconds after boot so we don't startle the user
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }

    // 4. Android / Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:end-4 z-50 max-w-md animate-fade-in">
      <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-navy/95 p-4 text-cream shadow-2xl backdrop-blur-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold">
          <Smartphone size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-serif text-sm font-semibold text-white">
            {t("pwa.installTitle", "Install LingoTrace App")}
          </h4>
          <p className="mt-1 text-xs text-cream-400 leading-relaxed">
            {isIos
              ? t(
                  "pwa.iosTip",
                  "To install on iPhone: tap the Share button ⎋ at the bottom, then select 'Add to Home Screen' ➕"
                )
              : t(
                  "pwa.installDesc",
                  "Add LingoTrace to your home screen for fast fullscreen access and instant alerts."
                )}
          </p>

          {!isIos && deferredPrompt && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-gold-light"
              >
                <Download size={14} />
                <span>{t("pwa.installBtn", "Install App")}</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs text-cream-400 hover:text-white px-2 py-1"
              >
                {t("pwa.later", "Later")}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1 text-cream-400 hover:bg-white/10 hover:text-white transition"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
