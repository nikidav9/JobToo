import { Platform } from 'react-native';

// The static HTML splash (app/+html.tsx) stays up until the app explicitly
// hides it — this is THE single loading screen on web.
export function hideWebSplash(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const web = window as any;
  // На быстром устройстве React effect может выполниться раньше нижнего inline
  // script из +html. Не теряем сигнал готовности — script подхватит флаг.
  if (typeof web.__hideSplash === 'function') web.__hideSplash();
  else web.__jobtooHideSplashRequested = true;
}

/** Report a completed boot milestone to the single HTML loading screen. */
export function setWebSplashProgress(percent: number): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const value = Math.max(1, Math.min(100, Math.round(percent)));
  const web = window as any;
  if (typeof web.__setSplashProgress === 'function') web.__setSplashProgress(value);
  else web.__jobtooSplashPendingProgress = Math.max(web.__jobtooSplashPendingProgress || 1, value);
}

/** Distinguishes a broken/stale bundle from a bundle that is loading data. */
export function markWebBundleMounted(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (window as any).__jobtooBundleMounted = true;
  setWebSplashProgress(35);
}

/** Report a completed boot milestone to the single HTML loading screen. */
export function setWebSplashProgress(percent: number): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (window as any).__setSplashProgress?.(Math.max(1, Math.min(100, Math.round(percent))));
}

/** Distinguishes a broken/stale bundle from a bundle that is loading data. */
export function markWebBundleMounted(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (window as any).__jobtooBundleMounted = true;
  setWebSplashProgress(35);
}
