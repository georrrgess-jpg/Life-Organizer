// Offline support: network first, falling back to the cached copy.
const CACHE = 'evenday-v1';
const FILES = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/store.js', 'js/dates.js', 'js/icons.js', 'js/ui.js',
  'js/components.js', 'js/forms.js', 'js/views/today.js', 'js/views/calendar.js', 'js/views/tasks.js', 'js/views/apps.js',
  'js/views/settings.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
