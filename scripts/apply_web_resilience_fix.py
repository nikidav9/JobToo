from pathlib import Path

# 1) Web deploy: stop rewriting Expo/static asset URLs to the broken Timeweb CDN.
deploy = Path('.github/workflows/deploy-regru.yml')
s = deploy.read_text()
start = s.find('      # Статику — с Timeweb CDN, а не с одного нашего сервера.')
end = s.find('      # Здесь же собирались файлы секретов для Reg.ru:', start)
if start == -1 or end == -1:
    raise SystemExit('CDN rewrite block not found in deploy workflow')
s = s[:start] + "      # Статика остаётся same-origin: HTML, JS/CSS и assets обслуживаются\n      # одним origin. Технический Timeweb CDN здесь больше не используется.\n\n" + s[end:]
deploy.write_text(s)

# 2) Service worker: v6, network-first for navigation, cache fallback.
sw = Path('public/sw.js')
sw.write_text(r'''// App-shell cache. v6 switches navigation to network-first while keeping a safe offline fallback.
const SHELL_CACHE = 'jobtoo-app-shell-v6';
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

// Fetch a complete fresh shell from the origin. The fresh HTML is only cached
// after every same-origin bundle referenced by it is reachable and cached.
async function fetchFreshShell(cache) {
  const response = await fetchWithTimeout('/', 12000);
  if (!response.ok) throw new Error('shell HTTP ' + response.status);

  const html = await response.clone().text();
  const assetUrls = Array.from(new Set([...SHELL_STATIC, ...shellAssetUrls(html)]));
  await Promise.all(assetUrls.map(async (url) => {
    if (url.startsWith('/_expo/static/') || url.startsWith('/assets/')) {
      const have = await cache.match(url);
      if (have) return;
    }
    const item = await fetchWithTimeout(url, 12000);
    if (!item.ok) throw new Error(url + ' HTTP ' + item.status);
    await cache.put(url, item.clone());
  }));

  await cache.put('/', response.clone());
  await cache.put('/index.html', response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  // Do not pin navigation to the cache at install time. The first navigation
  // will prefer the network and fall back to an older complete shell if needed.
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

      // Network-first: when the origin is reachable, return the current release.
      try {
        return await fetchFreshShell(cache);
      } catch {
        // Offline / broken path: use the last complete shell only as fallback.
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
''')

# 3) Hooks: move permanent-deck undo hooks before the early currentUser return.
feed = Path('app/(tabs)/feed.tsx')
s = feed.read_text()
block = """  // «Назад»: вернуть последнюю пролистанную карточку наверх колоды. Отклик,
  // если он уже ушёл, не отзываем — как в сменах кнопка просто возвращает вид.
  const swUndo = useCallback(() => {
    setSwHistory(h => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setSwSkipped(s => { const n = new Set(s); n.delete(last); return n; });
      return h.slice(0, -1);
    });
  }, []);
  useEffect(() => {
    onUndoChange?.(swHistory.length ? swUndo : null);
    return () => onUndoChange?.(null);
  }, [swHistory.length, swUndo, onUndoChange]);
"""
if s.count(block) != 1:
    raise SystemExit(f'swUndo block count: {s.count(block)}')
s = s.replace(block, '', 1)
anchor = """  const swPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) * 1.2 && Math.abs(g.dx) > 8,
      onPanResponderGrant: () => {
        swPan.setOffset({ x: (swPan.x as any)._value, y: (swPan.y as any)._value });
        swPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: swPan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dx, vx }) => {
        swPan.flattenOffset();
        if (dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) swWantRef.current(Math.abs(vx));
        else if (dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) swSkipRef.current(Math.abs(vx));
        else swSnapBackRef.current();
      },
      onPanResponderTerminate: () => swSnapBackRef.current(),
    })
  ).current;

"""
if s.count(anchor) != 1:
    raise SystemExit(f'pan responder anchor count: {s.count(anchor)}')
s = s.replace(anchor, anchor + block + '\n', 1)
feed.write_text(s)
