// Cobra Digitize — app-shell service worker.
// IMPORTANT: this ONLY caches the static shell (HTML/manifest/icons).
// Every live request — Apps Script (/exec), Google Sheets gviz CSV, Drive
// thumbnails/files — is cross-origin and is deliberately left untouched, so
// job data is never served stale and writes are never intercepted. The app's
// own in-memory/localStorage cache (WBJOBS) handles offline job data.

const CACHE_NAME = "cobra-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "../icon192.png",
  "../icon512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only manage our own origin's shell. Anything cross-origin (script.google.com,
  // docs.google.com, drive.google.com, *.googleusercontent.com) passes straight
  // through to the network and is never cached.
  if (url.origin !== self.location.origin) return;

  // Network-first: an online vendor always gets the latest app version;
  // offline, fall back to the cached shell.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
