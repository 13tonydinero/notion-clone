// Service worker: rende l'app utilizzabile offline.
// - All'installazione mette in cache tutti i file elencati in /precache.json (generato dalla build).
// - Le pagine HTML usano "rete prima, cache come ripiego"; i file con hash sono "cache prima".
// La sincronizzazione dei dati (WebSocket) non passa di qui: i documenti stanno in IndexedDB.
const CACHE = 'nc-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try {
      const res = await fetch('/precache.json', { cache: 'no-store' })
      const { files } = await res.json()
      await Promise.all(files.map((f) => cache.add(f).catch(() => {})))
    } catch {
      await cache.add('/').catch(() => {})
    }
    self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sync/')) return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put('/', fresh.clone())
        return fresh
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(req)
    if (cached) return cached
    try {
      const res = await fetch(req)
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
      return res
    } catch {
      return Response.error()
    }
  })())
})
