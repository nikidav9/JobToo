// App-shell cache. v7 keeps navigation truly network-first: a reachable HTML
// response is returned immediately and asset caching is best-effort only.
const SHELL_CACHE = 'jobtoo-app-shell-v7';
const SHELL_STATIC = ['/manifest.json', '/favicon.ico', '/jt-logo.jpg'];

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function shellAssetUrls(html) {
  return Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((url) => url.startsWith('/_expo/static/') || url.startsWith('/assets/'));
}

async function cacheFreshShell(cache, response) {
  const html = await response.clone().text();
  const assetUrls = Array.from(new Set([...SHELL_STATIC, ...shellAssetUrls(html)]));

  // Cache the HTML first. Optional icons or one slow bundle must never turn a
  // successful navigation into the offline error page.
  await cache.put('/', response.clone());
  await cache.put('/index.html', response.clone());

  await Promise.allSettled(assetUrls.map(async (url) => {
    const item = await fetchWithTimeout(url, 12000);
    if (!item.ok) throw new Error(url + ' HTTP ' + item.status);
    await cache.put(url, item.clone());
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all(
      (await caches.keys())
        .filter((name) => name.startsWith('jobtoo-app-shell-') && name !== SHELL_CACHE)
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);

      try {
        const response = await fetchWithTimeout(request, 12000);
        if (!response.ok) throw new Error('shell HTTP ' + response.status);
        event.waitUntil(cacheFreshShell(cache, response.clone()).catch(() => {}));
        return response;
      } catch {
        const cached = (await cache.match(request))
          || (await cache.match('/'))
          || (await cache.match('/index.html'));
        if (cached) return cached;
      }

      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>JobToo</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f7fa;color:#172033;display:grid;place-items:center;min-height:100vh;margin:0}.c{max-width:320px;text-align:center;padding:28px}button{border:0;border-radius:14px;background:#ff6b1a;color:#fff;padding:14px 22px;font-weight:700}</style><div class="c"><h1>JobToo</h1><p>Не удалось подключиться. Повторите попытку, когда сеть восстановится.</p><button onclick="location.reload()">Повторить</button></div>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin
      && (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/'))) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const fresh = await fetchWithTimeout(request, 8000);
          if (fresh.ok) await cache.put(request, fresh.clone());
          return fresh;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      return Response.error();
    })());
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil((async () => {
    const chatId = (data.data || {}).chatId;
    if (chatId) {
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const reading = wins.some((c) => c.focused && String(c.url).indexOf('chatId=' + chatId) !== -1);
      if (reading) return;
    }
    await self.registration.showNotification(data.title || 'JobToo', {
      body: data.body || '',
      icon: '/jt-logo.jpg',
      badge: '/favicon.ico',
      data: data.data || {},
      vibrate: [200, 100, 200],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
