import { useSyncExternalStore } from "react";

/**
 * "Full-screen mode": the browser goes full screen (where the Fullscreen API exists) and the side menu turns into a
 * sticky bottom bar, which hands the sidebar's width back to the page.
 *
 * The mode is derived from the browser's real fullscreen state, so pressing Esc (or the browser's own exit control)
 * brings the sidebar back automatically. Where the API isn't available (iPhone Safari, embedded browsers) or the
 * request is refused, the same layout is applied on its own and remembered for the browser session.
 */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const LAYOUT_KEY = "lingotrace-immersive-layout";
const SUGGESTED_KEY = "lingotrace-fs-suggested";
const listeners = new Set<() => void>();

let layoutOnly = (() => {
  try {
    return sessionStorage.getItem(LAYOUT_KEY) === "1";
  } catch {
    return false;
  }
})();

const fsElement = () => {
  const d = document as FsDoc;
  return d.fullscreenElement || d.webkitFullscreenElement || null;
};
const snapshot = () => !!fsElement() || layoutOnly;
const emit = () => listeners.forEach((l) => l());

function setLayoutOnly(on: boolean) {
  layoutOnly = on;
  try {
    if (on) sessionStorage.setItem(LAYOUT_KEY, "1");
    else sessionStorage.removeItem(LAYOUT_KEY);
  } catch {
    /* storage unavailable — the mode simply won't survive a reload */
  }
  emit();
}

if (typeof document !== "undefined") {
  document.addEventListener("fullscreenchange", emit);
  document.addEventListener("webkitfullscreenchange", emit);
}

export async function enterFullscreenMode(): Promise<void> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else setLayoutOnly(true);
  } catch {
    setLayoutOnly(true); // refused by the browser → still give the roomier layout
  }
}

export async function exitFullscreenMode(): Promise<void> {
  setLayoutOnly(false);
  try {
    if (fsElement()) {
      const d = document as FsDoc;
      if (d.exitFullscreen) await d.exitFullscreen();
      else await d.webkitExitFullscreen?.();
    }
  } catch {
    /* already out */
  }
  emit();
}

export function useFullscreenMode() {
  const immersive = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => false
  );
  return {
    immersive,
    enter: enterFullscreenMode,
    exit: exitFullscreenMode,
    toggle: () => (snapshot() ? exitFullscreenMode() : enterFullscreenMode()),
  };
}

/* One suggestion per login: remembered for the browser session and cleared on sign-out. */
export const wasFullscreenSuggested = (uid: string) => {
  try {
    return sessionStorage.getItem(`${SUGGESTED_KEY}:${uid}`) === "1";
  } catch {
    return true;
  }
};
export const markFullscreenSuggested = (uid: string) => {
  try {
    sessionStorage.setItem(`${SUGGESTED_KEY}:${uid}`, "1");
  } catch {
    /* ignore */
  }
};
export const clearFullscreenSuggestion = () => {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(SUGGESTED_KEY))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
};
