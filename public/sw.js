// App-shell cache. Bump on every behavioral change; hashed Expo assets remain immutable.
const SHELL_CACHE = 'jobtoo-app-shell-v4';
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/jt-logo.jpg'];

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function cacheCompleteShell() {
  const response = await fetchWithTimeout('/', 12000);
  if (!response.ok) throw new Error('shell HTTP ' + response.status);

  const html = await response.clone().text();
  // A new worker becomes active only after every bundle referenced by its HTML
  // is downloadable. This prevents an updated index from pointing to missing JS.
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((url) => url.startsWith('/_expo/static/') || url.startsWith('/assets/'));

  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(Array.from(new Set([...SHELL_URLS, ...assetUrls])).map(async (url) => {
    const item = url === '/' ? response.clone() : await fetchWithTimeout(url, 12000);
    if (!item.ok) throw new Error(url + ' HTTP ' + item.status);
    await cache.put(url, item);
  }));
}

self.addEventListener('install', (event) => {
  // If the new release is incomplete or the network drops, installation fails
  // and the previous worker/cache keeps serving the working application.
  event.waitUntil(cacheCompleteShell().then(() => self.skipWaiting()));
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
      const cached = (await cache.match(request))
        || (await cache.match('/'))
        || (await cache.match('/index.html'));

      // Свежую версию тянем всегда, но НЕ заставляем человека её ждать.
      //
      // Раньше здесь была строгая «сначала сеть»: до 6 секунд ждали ответ и
      // только потом показывали сохранённое. На моргающей мобильной сети это и
      // был тот самый «через раз, долго открывается» — секунды белого экрана,
      // хотя рабочая версия уже лежала в кэше. Перезагрузка телефона сбрасывала
      // сетевое состояние, и на время становилось быстро.
      //
      // Теперь наоборот: есть оболочка в кэше — показываем её сразу, как
      // нативное приложение, а сеть догоняет в фоне и обновляет кэш к
      // следующему открытию. Файлы сборки помечены отпечатком и лежат в кэше
      // отдельно, поэтому мгновенно показанная оболочка ссылается на уже
      // сохранённые скрипты. Само лечится: медленная сеть больше не тормозит
      // запуск, а свежесть подтягивается незаметно.
      const fromNetwork = fetchWithTimeout(request, 6000).then(async (fresh) => {
        if (fresh && fresh.ok) {
          await cache.put('/', fresh.clone());
          await cache.put('/index.html', fresh.clone());
        }
        return fresh;
      }).catch(() => null);

      if (cached) {
        // Фоновое обновление не должно всплыть необработанной ошибкой.
        fromNetwork.catch(() => {});
        return cached;
      }

      // Кэша ещё нет — самый первый заход. Тут без сети никак: ждём её, а если
      // и она молчит — отдаём понятную заглушку вместо зависания.
      const fresh = await fromNetwork;
      return fresh || new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>JobToo</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f7fa;color:#172033;display:grid;place-items:center;min-height:100vh;margin:0}.c{max-width:320px;text-align:center;padding:28px}button{border:0;border-radius:14px;background:#ff6b1a;color:#fff;padding:14px 22px;font-weight:700}</style><div class="c"><h1>JobToo</h1><p>Не удалось подключиться. Рабочая версия сохранена и откроется, когда сеть восстановится.</p><button onclick="location.reload()">Повторить</button></div>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin
      && (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/'))) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, fresh.clone());
      }
      return fresh;
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
