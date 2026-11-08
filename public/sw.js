// LingoTrace Service Worker — offline shell + notification display.
// Bump CACHE_NAME to force every client to drop old caches.
const CACHE_NAME = 'lingotrace-v2';
const SCOPE = self.registration.scope; // e.g. https://example.com/
const PRECACHE = ['logo-192.png', 'logo-512.png', 'apple-touch-icon.png', 'favicon.ico', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Add one by one so a single missing file can't abort the whole precache
      .then((cache) => Promise.all(PRECACHE.map((p) => cache.add(new URL(p, SCOPE)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs. Firebase, Cloudinary, EmailJS, fonts etc. go straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: network-first so a new deploy is picked up immediately; cached shell only when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(new URL('index.html', SCOPE), copy));
          }
          return res;
        })
        .catch(() => caches.match(new URL('index.html', SCOPE)).then((r) => r || Response.error()))
    );
    return;
  }

  // Hashed build assets (/assets/*) never change -> cache-first. Everything else: stale-while-revalidate.
  const immutable = url.pathname.includes('/assets/');
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached && immutable) return cached;
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});

// ---------------- Notifications ----------------
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { body: event.data.text() }; }
  }
  const title = data.title || 'LingoTrace | لينغوتريس';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || new URL('logo-192.png', SCOPE).href,
      badge: data.badge || new URL('favicon-32x32.png', SCOPE).href,
      data: { url: data.url || SCOPE },
      dir: 'auto',
      vibrate: [150, 50, 150],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || SCOPE;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(SCOPE) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
