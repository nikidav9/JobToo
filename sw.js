const CACHE = 'jm-v2'

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Never intercept: navigations, Supabase API, non-GET
  if (e.request.mode === 'navigate') return
  if (e.request.method !== 'GET') return
  if (url.hostname.includes('supabase.co')) return
  if (url.hostname !== location.hostname) return

  // Cache-first for static assets, network-first for pages
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(cached => {
          if (cached) return cached
          return fetch(e.request).then(res => {
            if (res.ok) c.put(e.request, res.clone())
            return res
          })
        })
      )
    )
  }
})
