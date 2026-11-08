/**
 * Registers the PWA service worker — production builds only, so `npm run dev`
 * never caches Vite's dev modules. Uses BASE_URL so it works on any deep link
 * (e.g. /portal/parent) instead of resolving "sw.js" relative to the page.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((err) => console.warn("LingoTrace SW registration failed:", err));
  });
}
