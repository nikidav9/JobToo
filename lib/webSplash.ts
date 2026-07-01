import { Platform } from 'react-native';

// The static HTML splash (app/+html.tsx) stays up until the app explicitly
// hides it — this is THE single loading screen on web.
export function hideWebSplash(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (window as any).__hideSplash?.();
}
