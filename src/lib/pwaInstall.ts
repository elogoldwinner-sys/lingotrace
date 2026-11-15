/**
 * Shared "install the app" state. The browser's `beforeinstallprompt` event fires once and early, so it is captured
 * here at app start (this module is imported from main.tsx) and handed to whichever component asks for it later.
 */
import { currentApp, type AppId } from "./appIdentity";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** What this browser can do: a real install button ("native") or only written steps. */
export type InstallMode = "native" | "ios" | "iosOther" | "inApp" | "manual";

// Teacher, parent and student each install their own app (see appIdentity.ts), so "already installed" is remembered
// per app: installing the parent app must not hide the install button on the teacher pages.
const installedKey = (app: AppId) => (app === "default" ? "lingotrace-app-installed" : `lingotrace-app-installed:${app}`);
function readInstalledFlag(app: AppId = currentApp()): boolean {
  try {
    return localStorage.getItem(installedKey(app)) === "1";
  } catch {
    return false;
  }
}
function markInstalled(app: AppId = promptApp ?? currentApp()): void {
  installedNow.add(app);
  try {
    localStorage.setItem(installedKey(app), "1");
  } catch {
    /* private mode: the dock just stays hidden for this visit */
  }
}

let stashedPrompt: BeforeInstallPromptEvent | null = null;
/** Which app's manifest was active when the browser offered the install prompt (a prompt installs that app only). */
let promptApp: AppId | null = null;
const installedNow = new Set<AppId>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e as BeforeInstallPromptEvent;
    promptApp = currentApp();
    notify();
  });
  window.addEventListener("appinstalled", () => {
    stashedPrompt = null;
    markInstalled();
    promptApp = null;
    notify();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", notify);
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the app is installed (running as the app, or installed from this browser earlier): nothing left to install. */
export function isRunningAsApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    installedNow.has(currentApp()) ||
    readInstalledFlag() ||
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
  // A stashed prompt only installs the app whose manifest was active when it fired; after moving to another
  // portal inside the site, fall back to the written steps (the browser menu installs the current page's app).
  if (stashedPrompt && promptApp === currentApp()) return "native";
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
  if (choice.outcome === "accepted") markInstalled(promptApp ?? currentApp());
  promptApp = null;
  notify();
  return choice.outcome;
}
