import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'JzY-tWPqlyhIrdZqG2NrmUIJCyAzexhCz5z8GHSOJNga5SLWZ2eGpNtn3bZCt0ep0NQ4xz8AsP_07LF3vETG7w';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const WP_FLAG = 'webpush_registered';

export function isWebPushRegistered(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(WP_FLAG) === '1';
}

export async function registerWebPush(userId: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[webpush] PushManager not available (not standalone PWA on iOS?)');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[webpush] Permission not granted:', permission);
      return false;
    }

    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJson = sub.toJSON();
    const { error } = await supabase.from('jm_web_push_subscriptions').upsert({
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: (subJson.keys as any)?.p256dh,
      auth: (subJson.keys as any)?.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) {
      console.error('[webpush] Supabase upsert error:', error.message);
      return false;
    }

    localStorage.setItem(WP_FLAG, '1');
    console.info('[webpush] Subscription saved for user:', userId);
    return true;
  } catch (e) {
    console.error('[webpush] Registration error:', e);
    return false;
  }
}
