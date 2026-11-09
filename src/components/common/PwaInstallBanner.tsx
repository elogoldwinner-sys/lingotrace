import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Closing the banner only hides it for the current visit (kept in memory, not saved).
// It comes back on the next page load until the app is installed.
let dismissedThisVisit = false;

/* ------------------------------------------------------------------ */
/* Capture `beforeinstallprompt` at module load.                       */
/* Chrome fires it once, early. If we only listened inside a component */
/* that mounts after login, the event would already be gone.           */
/* ------------------------------------------------------------------ */
let stashedPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    stashedPrompt = null;
    installed = true;
    listeners.forEach((fn) => fn());
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

/** Browsers embedded in other apps (WhatsApp, Instagram, Facebook…) can't install a web app. */
function isInAppBrowser(): boolean {
  const ua = window.navigator.userAgent;
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|TikTok|Twitter|; wv\)/i.test(ua);
}

/** On iPhone/iPad only Safari can add to the home screen; Chrome/Firefox/Edge on iOS cannot. */
function isIosNonSafari(): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(window.navigator.userAgent);
}

type Mode = "native" | "ios" | "iosOther" | "inApp" | "manual";

function detectFallbackMode(): Mode {
  if (isInAppBrowser()) return "inApp";
  if (isIosDevice()) return isIosNonSafari() ? "iosOther" : "ios";
  return "manual";
}

export default function PwaInstallBanner() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(stashedPrompt);
  const [visible, setVisible] = useState(false);
  const [fallback, setFallback] = useState<Mode | null>(null);

  useEffect(() => {
    if (isStandalone() || dismissedThisVisit || installed) return;

    const sync = () => {
      setDeferredPrompt(stashedPrompt);
      if (installed || isStandalone()) setVisible(false);
      else if (stashedPrompt && !dismissedThisVisit) setVisible(true);
    };
    listeners.add(sync);

    let timer: number | undefined;
    if (stashedPrompt) {
      setVisible(true);
    } else {
      // No install event from this browser. iPhones (and in-app browsers) never send one, so show instructions
      // right away; elsewhere wait a moment in case the event is just late, then show the manual instructions.
      const mode = detectFallbackMode();
      const delay = mode === "manual" ? 3500 : 1500;
      timer = window.setTimeout(() => {
        if (stashedPrompt || installed || dismissedThisVisit) return;
        setFallback(mode);
        setVisible(true);
      }, delay);
    }

    return () => {
      listeners.delete(sync);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function hideForAWhile() {
    dismissedThisVisit = true;
    setVisible(false);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    stashedPrompt = null; // a prompt event can only be used once
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setVisible(false);
    else hideForAWhile(); // they cancelled the native dialog -> like "Later"
  }

  if (!visible) return null;

  // A real install event always wins over the instructions.
  const mode: Mode = deferredPrompt ? "native" : fallback || "manual";
  const text =
    mode === "ios"
      ? t("pwa.iosTip", "On iPhone: tap the Share button, then choose \"Add to Home Screen\".")
      : mode === "iosOther"
      ? t("pwa.iosOtherTip", "On iPhone, open this page in Safari, then tap Share and choose \"Add to Home Screen\".")
      : mode === "inApp"
      ? t("pwa.inAppTip", "Open this page in your browser (Chrome or Safari) from the ⋮ or Share menu, then install the app.")
      : mode === "manual"
      ? t("pwa.manualTip", "To install: open your browser menu (⋮) and choose \"Install app\" or \"Add to Home screen\".")
      : t("pwa.installDesc", "Add LingoTrace to your home screen for quick, full-screen access.");

  return (
    <div className="fixed bottom-24 inset-x-3 sm:inset-x-auto sm:end-6 z-40 max-w-md">
      <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-navy/95 p-4 text-cream shadow-2xl backdrop-blur-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold">
          <Smartphone size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-serif text-sm font-semibold text-white">
            {t("pwa.installTitle", "Install the LingoTrace app")}
          </h4>
          <p className="mt-1 text-xs text-cream-400 leading-relaxed">{text}</p>

          <div className="mt-3 flex items-center gap-2">
            {mode === "native" && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-navy transition hover:opacity-90"
              >
                <Download size={14} />
                <span>{t("pwa.installBtn", "Install app")}</span>
              </button>
            )}
            <button type="button" onClick={hideForAWhile} className="text-xs text-cream-400 hover:text-white px-2 py-1">
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
