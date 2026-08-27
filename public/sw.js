self.addEventListener('install', () => {
  // Новая версия должна начать управлять PWA сразу, а не после закрытия всех
  // старых вкладок. Иначе установленное приложение может ещё сутки открывать
  // оболочку от предыдущей выкладки.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();

    // Новая версия worker'а активировалась — значит выкладка сменилась.
    // Заставляем уже открытые окна перезагрузиться, чтобы они взяли свежий
    // index.html и bundle, а не висели на старой застрявшей оболочке.
    //
    // Это единственный способ вытащить залипшую установленную PWA (и вебвью
    // Телеграма) БЕЗ ручной переустановки: сама зависшая страница
    // перезагрузиться не может, а worker обновляется независимо от неё —
    // загрузчик в +html.tsx регистрирует и обновляет его ещё до того, как
    // зависает bundle. Навигация на тот же URL идёт через fetch-обработчик
    // ниже (network-first для навигаций) → приходит свежая оболочка.
    //
    // Срабатывает один раз на смену версии worker'а, поэтому цикла
    // перезагрузок не создаёт. Рабочую страницу это перезагрузит разве что в
    // момент самой выкладки — на заставке/раннем старте это незаметно.
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(wins.map((c) => {
        if (typeof c.navigate === 'function') return c.navigate(c.url).catch(() => {});
        if (typeof c.postMessage === 'function') { c.postMessage({ type: 'jt-reload' }); }
        return undefined;
      }));
    } catch (e) {}
  })());
});

self.addEventListener('fetch', (event) => {
  // HTML-навигация всегда идёт в сеть. Статические bundle-файлы имеют хеши и
  // кэшируются nginx надолго, но устаревший index.html может ссылаться на уже
  // удалённый bundle — результатом был вечный белый экран в установленной PWA.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    (async () => {
      // Не показываем уведомление о сообщении, если эта же переписка открыта и
      // вкладка активна — человек и так видит сообщение на экране. Спрашиваем
      // не страницу, а список окон: service worker выгружается между
      // уведомлениями и любое запомненное им состояние теряется, а адрес
      // открытой вкладки доступен всегда.
      const chatId = (data.data || {}).chatId;
      if (chatId) {
        const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const reading = wins.some(
          (c) => c.focused && String(c.url).indexOf('chatId=' + chatId) !== -1
        );
        if (reading) return;
      }

      await self.registration.showNotification(data.title || 'JobToo', {
        body: data.body || '',
        icon: '/jt-logo.jpg',
        badge: '/favicon.ico',
        data: data.data || {},
        vibrate: [200, 100, 200],
      });
    })()
  );
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
