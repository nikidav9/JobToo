self.addEventListener('install', () => {
  // Новая версия должна начать управлять PWA сразу, а не после закрытия всех
  // старых вкладок. Иначе установленное приложение может ещё сутки открывать
  // оболочку от предыдущей выкладки.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Принудительную перезагрузку открытых окон при активации (client.navigate)
  // пришлось убрать: на нестабильной/фильтруемой сети она навязывала окну
  // навигацию, а обработчик fetch отдаёт навигацию только из сети без запасного
  // варианта — навигация зависала, и сайт переставал грузиться вообще. Свежую
  // оболочку в застрявшую PWA будем доставлять безопаснее, не перебивая уже
  // идущую загрузку. Здесь — только берём управление.
  event.waitUntil(self.clients.claim());
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
