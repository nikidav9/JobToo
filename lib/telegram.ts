import { Platform } from 'react-native';

// ─── Telegram Mini App helpers ────────────────────────────────────────────────
// The telegram-web-app.js SDK is loaded in app/+html.tsx. When JobToo runs
// inside Telegram's WebView, window.Telegram.WebApp is available and carries
// signed init data about the Telegram user.

type TgWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

function getWebApp(): any | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const wa = (window as any).Telegram?.WebApp;
  // initData is empty when the page is opened in a normal browser
  if (!wa || !wa.initData) return null;
  return wa;
}

export function isTelegramMiniApp(): boolean {
  return getWebApp() !== null;
}

/** Raw signed init data string — server validates its HMAC with the bot token */
export function getTelegramInitData(): string | null {
  return getWebApp()?.initData ?? null;
}

export function getTelegramUser(): TgWebAppUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

/** start_param from t.me/<bot>/<app>?startapp=... deep links */
export function getTelegramStartParam(): string | null {
  return getWebApp()?.initDataUnsafe?.start_param ?? null;
}

/** Prepare the Mini App viewport: full height, ready signal, closing guard */
export function initTelegramMiniApp(): void {
  const wa = getWebApp();
  if (!wa) return;
  try {
    wa.ready();
    wa.expand();
    // Avoid accidental closes while scrolling feeds
    wa.isClosingConfirmationEnabled = true;
    if (typeof wa.disableVerticalSwipes === 'function') wa.disableVerticalSwipes();
    if (typeof wa.setHeaderColor === 'function') wa.setHeaderColor('#FFFFFF');
    if (typeof wa.setBackgroundColor === 'function') wa.setBackgroundColor('#FFFFFF');
  } catch {}
}

export function telegramHapticFeedback(type: 'light' | 'success' = 'light'): void {
  const wa = getWebApp();
  if (!wa?.HapticFeedback) return;
  try {
    if (type === 'success') wa.HapticFeedback.notificationOccurred('success');
    else wa.HapticFeedback.impactOccurred('light');
  } catch {}
}
