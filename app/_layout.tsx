import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, Text, Animated, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { Stack, useRouter, usePathname } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AlertProvider } from '@/template';
import { AppProvider, AppContext } from '@/contexts/AppContext';
import { ToastLayer } from '@/components/ui/ToastLayer';
import { requestNotificationPermissions, setupAndroidChannels } from '@/services/notifications';

function AuthGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const ctx = React.useContext(AppContext);

  const publicPaths = new Set(['/', '/login', '/register-worker', '/register-employer', '/legal']);

  useEffect(() => {
    if (!ctx) return;
    if (ctx.loading) return;
    const isProtected = !publicPaths.has(pathname);
    if (!ctx.currentUser && isProtected) {
      router.replace('/');
    }
  }, [ctx?.currentUser?.id, ctx?.loading, pathname]);

  return null;
}

// Handles navigation when user taps a push notification
function NotificationHandler() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Foreground: notification received while app is open — no extra action needed,
    // Realtime subscriptions already update the UI.
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // UI updates handled by Realtime/polling in AppContext
    });

    // Background/terminated: user tapped the notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = data?.type as string | undefined;
      const chatId = data?.chatId as string | undefined;

      if (type === 'message' && chatId) {
        router.push({ pathname: '/chat-room', params: { chatId } });
      } else if (type === 'match_worker' || type === 'match_employer') {
        router.push('/(tabs)/matches');
      } else if (type === 'new_applicant') {
        router.push('/(tabs)/matches');
      } else if (type === 'nearby_shift' || type === 'nearby_perm') {
        router.push('/(tabs)');
      }
    });

    // Handle notification that launched the app from terminated state
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = data?.type as string | undefined;
      const chatId = data?.chatId as string | undefined;

      if (type === 'message' && chatId) {
        setTimeout(() => router.push({ pathname: '/chat-room', params: { chatId } }), 500);
      } else if (type === 'match_worker' || type === 'match_employer' || type === 'new_applicant') {
        setTimeout(() => router.push('/(tabs)/matches'), 500);
      }
    }).catch(() => {});

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return null;
}

function OTAUpdateScreen({ progress }: { progress: Animated.Value }) {
  return (
    <View style={otaStyles.container}>
      <Text style={otaStyles.logo}>JobToo</Text>
      <Text style={otaStyles.title}>Загружаем обновление...</Text>
      <View style={otaStyles.track}>
        <Animated.View style={[otaStyles.bar, {
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
      <Text style={otaStyles.sub}>Это займёт несколько секунд</Text>
    </View>
  );
}

const otaStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 40 },
  logo: { fontSize: 36, fontWeight: '900', color: '#2563EB', marginBottom: 32 },
  title: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 20 },
  track: { width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, backgroundColor: '#2563EB', borderRadius: 3 },
  sub: { fontSize: 13, color: '#9CA3AF', marginTop: 14 },
});

function useOTAUpdate() {
  const [isUpdating, setIsUpdating] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        setIsUpdating(true);
        progress.setValue(0);

        // Анимация до 85% пока качается
        Animated.timing(progress, {
          toValue: 0.85,
          duration: 8000,
          useNativeDriver: false,
        }).start();

        await Updates.fetchUpdateAsync();

        // Добиваем до 100% и перезапускаем
        Animated.timing(progress, {
          toValue: 1,
          duration: 400,
          useNativeDriver: false,
        }).start(async () => {
          await Updates.reloadAsync();
        });
      } catch {
        setIsUpdating(false);
      }
    };

    check();
  }, []);

  return { isUpdating, progress };
}

export default function RootLayout() {
  const { isUpdating, progress } = useOTAUpdate();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    setupAndroidChannels().catch(() => {});
    requestNotificationPermissions().catch(() => {});
  }, []);

  if (isUpdating) return <OTAUpdateScreen progress={progress} />;

  return (
    <AlertProvider>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <AuthGuard />
          <NotificationHandler />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="register-worker" />
            <Stack.Screen name="register-employer" />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="legal" />
            <Stack.Screen name="create-vacancy" />
            <Stack.Screen name="candidates" />
            <Stack.Screen name="chat-room" />
            <Stack.Screen name="match" options={{ presentation: 'modal' }} />
            <Stack.Screen name="rate" options={{ presentation: 'modal' }} />
            <Stack.Screen name="admin" />
            <Stack.Screen name="user-profile" />
            <Stack.Screen name="create-perm-vacancy" />
            <Stack.Screen name="perm-applications" />
            <Stack.Screen name="perm-vacancy-detail" />
          </Stack>
          <ToastLayer />
        </AppProvider>
      </SafeAreaProvider>
    </AlertProvider>
  );
}
