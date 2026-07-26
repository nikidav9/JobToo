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
