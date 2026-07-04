import { Platform } from 'react-native';

const VAPID_PUBLIC_KEY = 'BMps5FNvS_ODiL0Rf2d76P8cy_xLh2C7EVXb9mHABkZLQz58mwUzTVzkle_5R0ACYR0IGD-zuS4cuYEhuvCMYE4';

// Supabase напрямую из браузера блокируется в РФ — сохраняем через прокси jobtoo.ru
const PROXY_URL = process.env.EXPO_PUBLIC_API_URL
  ? `${process.env.EXPO_PUBLIC_API_URL}/api/db.php`
  : 'https://jobtoo.ru/api/db.php';
const APP_SECRET = process.env.EXPO_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const WP_FLAG = 'webpush_registered';
const WP_DEBUG = 'webpush_debug';

export function isWebPushRegistered(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(WP_FLAG) === '1';
}

export function getWebPushDebug(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(WP_DEBUG) || '';
}

function wpDebug(msg: string) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(WP_DEBUG, msg);
  console.warn('[webpush]', msg);
}

function wpTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`Зависло на шаге: ${step}. Закройте приложение полностью и попробуйте снова.`)), ms)
    ),
  ]);
}

export async function registerWebPush(userId: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;

  if (!('serviceWorker' in navigator)) {
    wpDebug('Ошибка: serviceWorker не поддерживается');
    return false;
  }
  if (!('PushManager' in window)) {
    wpDebug('Ошибка: PushManager недоступен. Откройте приложение через ярлык с экрана «Домой» (не в браузере)');
    return false;
  }

  try {
    wpDebug('Регистрируем sw.js...');
    const reg = await wpTimeout(navigator.serviceWorker.register('/sw.js'), 10_000, 'регистрация sw.js');
    wpDebug('Ждём готовности SW...');
    // iOS PWA: serviceWorker.ready может зависнуть навсегда — ждём не дольше 10с
    await wpTimeout(Promise.resolve(navigator.serviceWorker.ready), 10_000, 'ожидание service worker');

    wpDebug('Запрашиваем разрешение...');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      wpDebug(`Разрешение: ${permission}. Зайдите в Настройки → Safari → Уведомления`);
      return false;
    }

    wpDebug('Создаём push-подписку...');
    const existing = await wpTimeout(reg.pushManager.getSubscription(), 8_000, 'проверка подписки');
    const sub = existing ?? await wpTimeout(reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }), 12_000, 'создание подписки');

    wpDebug('Сохраняем в базу...');
    const subJson = sub.toJSON();
    const resp = await wpTimeout(fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET },
      body: JSON.stringify({
        fn: 'dbSaveWebPushSubscription',
        args: [userId, subJson.endpoint, (subJson.keys as any)?.p256dh, (subJson.keys as any)?.auth],
      }),
    }), 12_000, 'сохранение в базу');

    if (!resp.ok) {
      wpDebug(`Ошибка сервера: HTTP ${resp.status}`);
      return false;
    }

    localStorage.setItem(WP_FLAG, '1');
    localStorage.setItem(WP_DEBUG, 'OK — подписка сохранена!');
    console.info('[webpush] Subscription saved for user:', userId);
    return true;
  } catch (e: any) {
    wpDebug(`Исключение: ${e?.message ?? String(e)}`);
    return false;
  }
}
