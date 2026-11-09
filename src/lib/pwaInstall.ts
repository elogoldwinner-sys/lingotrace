/**
 * Shared "install the app" state. The browser's `beforeinstallprompt` event fires once and early, so it is captured
 * here at app start (this module is imported from main.tsx) and handed to whichever component asks for it later.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** What this browser can do: a real install button ("native") or only written steps. */
export type InstallMode = "native" | "ios" | "iosOther" | "inApp" | "manual";

let stashedPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    stashedPrompt = null;
    installedNow = true;
    notify();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", notify);
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the page is already running as the installed app (so there is nothing left to install). */
export function isRunningAsApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    installedNow ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports itself as "Macintosh" but has touch points
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/** Browsers embedded in other apps (WhatsApp, Instagram, Facebook …) cannot install a web app. */
function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|TikTok|Twitter|; wv\)/i.test(window.navigator.userAgent);
}

/** On iPhone/iPad only Safari can add to the home screen; Chrome / Firefox / Edge on iOS cannot. */
function isIosNonSafari(): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(window.navigator.userAgent);
}

export function getInstallMode(): InstallMode {
  if (stashedPrompt) return "native";
  if (isInAppBrowser()) return "inApp";
  if (isIosDevice()) return isIosNonSafari() ? "iosOther" : "ios";
  return "manual";
}

/** Opens the browser's own install dialog (only when `getInstallMode() === "native"`). */
export async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!stashedPrompt) return "unavailable";
  const evt = stashedPrompt;
  await evt.prompt();
  const choice = await evt.userChoice;
  stashedPrompt = null; // a prompt event can only be used once
  notify();
  return choice.outcome;
}
