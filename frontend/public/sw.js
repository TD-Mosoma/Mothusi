// Mothusi service worker: keeps the app and the last lessons usable on a weak or missing connection.
// - The app shell and its files: served from the cache, refreshed in the background.
// - A few read-only API calls (lessons, the teacher's workspace): network first, the saved copy when offline.
// - Everything else, including live agent events and every change, always goes to the network.
const VERSION = 'v1'
const SHELL = `mothusi-shell-${VERSION}`
const API = 'mothusi-api' // cleared when anyone logs out
const OFFLINE_API = [/^\/api\/auth\/me$/, /^\/api\/teacher\/workspace$/, /^\/api\/learner\/(lesson|lessons|link|progress)$/, /^\/api\/runs\/[\w-]+$/]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.png', '/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mothusi-shell-') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const saved = await cache.match(request)
    if (saved) return saved
    throw error
  }
}

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(SHELL)
  const saved = await cache.match(request)
  const fresh = fetch(request).then((response) => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
    return response
  }).catch(() => saved)
  return saved || fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    if (OFFLINE_API.some((re) => re.test(url.pathname))) event.respondWith(networkFirst(request, API))
    return // everything else on the API goes straight to the network
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/', { cacheName: SHELL })))
    return
  }
  if (url.origin === self.location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
