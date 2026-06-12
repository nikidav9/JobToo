import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'JzY-tWPqlyhIrdZqG2NrmUIJCyAzexhCz5z8GHSOJNga5SLWZ2eGpNtn3bZCt0ep0NQ4xz8AsP_07LF3vETG7w';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerWebPush(userId: string): Promise<void> {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const subJson = sub.toJSON();
    await supabase.from('jm_web_push_subscriptions').upsert({
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: (subJson.keys as any)?.p256dh,
      auth: (subJson.keys as any)?.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch {
    // Never crash due to push setup failure
  }
}
