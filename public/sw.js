// App-shell cache. Bump on every behavioral change; hashed Expo assets remain immutable.
// v5: атомарное обновление оболочки — HTML в кэше подменяется ТОЛЬКО после того,
// как все его бандлы уже скачаны. Иначе после выкладки сохранённая оболочка могла
// ссылаться на бандл, которого нет в кэше, и на капризной сети (DPI/443) это
// давало белый экран «после обновления не грузит».
const SHELL_CACHE = 'jobtoo-app-shell-v5';
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

// Атомарно приводит кэш к новой сборке.
//
// Ключевой инвариант: HTML-оболочка (`/` и `/index.html`) обновляется в кэше
// ТОЛЬКО в самом конце — после того как все бандлы, на которые она ссылается,
// успешно скачаны и уложены в кэш. Если хоть один бандл не пришёл (сеть моргнула,
// DPI/443), бросаем исключение и НЕ трогаем сохранённую оболочку — продолжаем
// отдавать прежнюю рабочую пару «оболочка + бандлы». Так кэш никогда не указывает
// на недоступный скрипт — а именно это и есть «после обновления не грузит».
async function updateShell(cache) {
  const response = await fetchWithTimeout('/', 12000);
  if (!response.ok) throw new Error('shell HTTP ' + response.status);

  const html = await response.clone().text();
  const assetUrls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((url) => url.startsWith('/_expo/static/') || url.startsWith('/assets/'));

  // 1) Сначала гарантируем доступность ВСЕХ бандлов и статики новой оболочки.
  const staticUrls = Array.from(new Set([...SHELL_STATIC, ...assetUrls]));
  await Promise.all(staticUrls.map(async (url) => {
    // Неизменяемый бандл (отпечаток в имени) уже в кэше — повторно не тянем.
    if (url.startsWith('/_expo/static/') || url.startsWith('/assets/')) {
      const have = await cache.match(url);
      if (have) return;
    }
    const item = await fetchWithTimeout(url, 12000);
    if (!item.ok) throw new Error(url + ' HTTP ' + item.status);
    await cache.put(url, item);
  }));

  // 2) Все ресурсы на месте — только теперь безопасно подменить саму оболочку.
  await cache.put('/', response.clone());
  await cache.put('/index.html', response.clone());
}

self.addEventListener('install', (event) => {
  // If the new release is incomplete or the network drops, installation fails
  // and the previous worker/cache keeps serving the working application.
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await updateShell(cache);
    await self.skipWaiting();
  })());
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

      // Есть рабочая оболочка в кэше — показываем её сразу, как нативное
      // приложение. Обновление идёт в фоне и АТОМАРНО: новая HTML-оболочка
      // попадёт в кэш только вместе со всеми своими бандлами (см. updateShell).
      // Поэтому мгновенно показанная оболочка всегда ссылается на уже
      // сохранённые скрипты — белого экрана «после обновления» больше нет.
      if (cached) {
        event.waitUntil(updateShell(cache).catch(() => {}));
        return cached;
      }

      // Кэша ещё нет — самый первый заход. Пытаемся атомарно установить оболочку
      // и отдать её из кэша; если сеть молчит — понятная заглушка вместо зависания.
      try {
        await updateShell(cache);
        const fresh = await cache.match('/');
        if (fresh) return fresh;
      } catch { /* сеть недоступна на первом заходе — отдаём заглушку ниже */ }
      return new Response(
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
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      // Уже в кэше — отдаём мгновенно. Файлы Expo неизменяемые (отпечаток в
      // имени), так что кэш здесь никогда не устаревает.
      if (cached) return cached;

      // Нет в кэше — обычно это новый бандл после выкладки. Раньше здесь был
      // голый fetch без срока: на капризном Wi-Fi запрос мог висеть
      // бесконечно, приложению нечем отрисоваться — тот самый «чёрный экран,
      // загрузка не движется». Теперь тянем с таймаутом и парой повторов:
      // зависшую попытку обрываем и пробуем снова (на потерях это часто
      // проходит со второго раза), успех кэшируем.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const fresh = await fetchWithTimeout(request, 8000);
          // Успех кэшируем; не-200 (например 404 у выпиленного файла) не
          // повторяем — это не сетевой сбой, а осмысленный ответ.
          if (fresh.ok) await cache.put(request, fresh.clone());
          return fresh;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      // Три попытки впустую — отдаём сетевую ошибку, чтобы страница не висела
      // вечно, а могла показать сбой и перезагрузиться, а не морозить загрузку.
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
