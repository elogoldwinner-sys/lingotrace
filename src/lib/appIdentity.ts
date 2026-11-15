/**
 * One website, several installable apps. Each portal has its own web-app manifest (name, icon, colour, start page) and
 * its own install identity, so a teacher, a parent and a student can each install "their" app and have separate icons.
 *
 * The page the visitor is on decides which manifest the browser sees, so the Install button (and iOS "Add to Home
 * Screen") always installs the app that belongs to the portal they are looking at. Pages that belong to no single
 * portal (home, school, admin, shared login, invite links) keep the general LingoTrace app.
 *
 * The same mapping lives in a tiny inline script in index.html so the right manifest is in place before the app loads —
 * keep the two in sync.
 */
export type AppId = "teacher" | "parent" | "student" | "default";

export const APP_META: Record<AppId, { manifest: string; themeColor: string; title: string; touchIcon: string }> = {
  default: { manifest: "manifest.json", themeColor: "#0d1b2a", title: "LingoTrace", touchIcon: "apple-touch-icon.png" },
  teacher: { manifest: "manifest-teacher.json", themeColor: "#36207C", title: "LT Teacher", touchIcon: "icons/teacher-apple-touch.png" },
  parent: { manifest: "manifest-parent.json", themeColor: "#0F8B8D", title: "LT Parents", touchIcon: "icons/parent-apple-touch.png" },
  student: { manifest: "manifest-student.json", themeColor: "#EA580C", title: "LT Students", touchIcon: "icons/student-apple-touch.png" },
};

const TEACHER_PATHS = ["/login", "/dashboard", "/preferences", "/classes", "/students", "/attendance", "/sessions", "/archive", "/notes", "/projects", "/linked-activities"];

/** Which app a path (without the router base) belongs to. */
export function appForPath(path: string): AppId {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/portal/parent" || p.startsWith("/portal/parent/")) return "parent";
  if (p === "/portal/student" || p.startsWith("/portal/student/")) return "student";
  if (TEACHER_PATHS.some((t) => p === t || p.startsWith(t + "/"))) return "teacher";
  return "default";
}

/** The app for the page currently open (strips the router base first). */
export function currentApp(): AppId {
  if (typeof window === "undefined") return "default";
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const path = base && window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname;
  return appForPath(path);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (el.getAttribute("href") !== href) el.setAttribute("href", href);
}

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  if (el.content !== content) el.content = content;
}

/** Points the manifest, theme colour, iOS title and home-screen icon at the given app. Safe to call repeatedly. */
export function applyAppIdentity(app: AppId = currentApp()) {
  if (typeof document === "undefined") return;
  const base = import.meta.env.BASE_URL;
  const m = APP_META[app];
  setLink("manifest", `${base}${m.manifest}`);
  setLink("apple-touch-icon", `${base}${m.touchIcon}`);
  setMeta("theme-color", m.themeColor);
  setMeta("apple-mobile-web-app-title", m.title);
}
