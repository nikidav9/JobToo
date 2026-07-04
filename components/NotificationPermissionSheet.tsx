import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder,
  Dimensions, Platform, Easing, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Colors, Radius } from '@/constants/theme';
import { registerForPushNotifications } from '@/services/notifications';
import { registerWebPush, getWebPushDebug } from '@/lib/webPush';
import { isTelegramMiniApp } from '@/lib/telegram';
import { useApp } from '@/hooks/useApp';

const CHOICE_KEY = 'jm_notif_prompt_choice'; // 'enabled' once notifications are on
const SCREEN_H = Dimensions.get('window').height;
const SHOW_DELAY_MS = 1200;
const ENABLE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

export default function NotificationPermissionSheet() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const userId = app?.currentUser?.id ?? null;

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const slideY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const sheetHeightRef = useRef(480);

  // ─── Decide whether to show ────────────────────────────────────────────────
  // The sheet appears on EVERY entry until notifications are actually enabled.
  useEffect(() => {
    if (!userId) return;
    // Inside the Telegram Mini App notifications arrive via the bot — no sheet
    if (isTelegramMiniApp()) return;
    let cancelled = false;

    (async () => {
      try {
        const choice = await AsyncStorage.getItem(CHOICE_KEY);
        if (choice === 'enabled') return;

        if (Platform.OS === 'web') {
          // Browser Notification API: skip if unsupported or already resolved
          if (typeof Notification === 'undefined') return;
          if (Notification.permission === 'granted') {
            // Permission is on — finish the web push subscription silently
            const ok = await registerWebPush(userId).catch(() => false);
            if (ok) { await AsyncStorage.setItem(CHOICE_KEY, 'enabled'); return; }
            // Subscription incomplete — show the sheet so the user can retry
          } else if (Notification.permission === 'denied') {
            return; // browser-level deny can't be fixed from JS
          }
        } else {
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted') {
            await AsyncStorage.setItem(CHOICE_KEY, 'enabled');
            return;
          }
          // iOS: after a hard OS-level deny the dialog can't be re-shown — stop nagging
          if (status === 'denied' && Platform.OS === 'ios') {
            const { canAskAgain } = await Notifications.getPermissionsAsync();
            if (!canAskAgain) return;
          }
        }

        setTimeout(() => { if (!cancelled) open(); }, SHOW_DELAY_MS);
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // ─── Open / close animations ───────────────────────────────────────────────
  function open() {
    setVisible(true);
    dragY.setValue(0);
    slideY.setValue(SCREEN_H);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1, duration: 260, useNativeDriver: true,
      }),
      Animated.spring(slideY, {
        toValue: 0, tension: 60, friction: 12, useNativeDriver: true,
      }),
    ]).start();
  }

  function close(after?: () => void) {
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0, duration: 200, useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: SCREEN_H, duration: 260,
        easing: Easing.in(Easing.cubic), useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      after?.();
    });
  }

  // ─── Swipe down to dismiss ─────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > sheetHeightRef.current * 0.25 || g.vy > 0.9) {
          // Swipe away = same as X: show again next launch
          Animated.timing(dragY, {
            toValue: SCREEN_H, duration: 220,
            easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }).start(() => setVisible(false));
          Animated.timing(backdrop, { toValue: 0, duration: 220, useNativeDriver: true }).start();
        } else {
          Animated.spring(dragY, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  // ─── Actions ───────────────────────────────────────────────────────────────
  // X / «Не сейчас» / swipe just close the sheet — it returns on the next entry
  // until notifications are actually enabled.
  const handleClose = () => close();
  const handleSkip = () => close();

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      if (Platform.OS === 'web') {
        const ok = userId ? await withTimeout(registerWebPush(userId), ENABLE_TIMEOUT_MS) : false;
        if (ok) {
          await AsyncStorage.setItem(CHOICE_KEY, 'enabled');
          close();
        } else {
          // Stay open and explain instead of spinning forever
          setErrorMsg(getWebPushDebug() || 'Не получилось включить. Попробуйте ещё раз.');
        }
      } else {
        const { status } = await withTimeout(Notifications.requestPermissionsAsync(), ENABLE_TIMEOUT_MS);
        if (status === 'granted') {
          await AsyncStorage.setItem(CHOICE_KEY, 'enabled');
          if (userId) registerForPushNotifications(userId).catch(() => {});
        }
        close();
      }
    } catch {
      setErrorMsg('Не получилось включить (нет ответа). Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[st.backdrop, { opacity: backdrop }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          st.sheet,
          { paddingBottom: insets.bottom + 16 },
          { transform: [{ translateY: Animated.add(slideY, dragY) }] },
        ]}
        onLayout={e => { sheetHeightRef.current = e.nativeEvent.layout.height; }}
        {...panResponder.panHandlers}
      >
        {/* Grabber */}
        <View style={st.grabber} />

        {/* Close */}
        <TouchableOpacity style={st.closeBtn} onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={st.title}>Будьте в курсе</Text>
        <Text style={st.subtitle}>
          Включите уведомления, чтобы не пропустить важное — отклики, мэтчи и новые вакансии
        </Text>

        {/* Mock push preview */}
        <View style={st.pushCard}>
          <Image source={require('@/assets/images/jt-logo.png')} style={st.pushIcon} resizeMode="cover" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={st.pushTopRow}>
              <Text style={st.pushApp}>JobToo</Text>
              <Text style={st.pushNow}>сейчас</Text>
            </View>
            <Text style={st.pushTitle}>Мэтч! Вас хотят взять 🎉</Text>
            <Text style={st.pushBody} numberOfLines={1}>Кладовщик — м. Хорошёво, 95 000 ₽/мес…</Text>
          </View>
        </View>

        {/* Reasons */}
        <View style={st.reasons}>
          <Reason icon="notifications-outline" text="Мгновенно узнавайте о сообщениях и мэтчах" />
          <Reason icon="briefcase-outline" text="Получайте новые вакансии рядом с вами" />
          <Reason icon="checkmark-circle-outline" text="Не пропустите подтверждение смены" />
        </View>

        {/* Buttons */}
        <TouchableOpacity style={st.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={st.skipText}>Не сейчас</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.enableBtn, busy && { opacity: 0.7 }]}
          onPress={handleEnable}
          activeOpacity={0.85}
          disabled={busy}
        >
          <Text style={st.enableText}>{busy ? 'Подключаем…' : errorMsg ? 'Попробовать ещё раз' : 'Включить уведомления'}</Text>
        </TouchableOpacity>
        {errorMsg ? <Text style={st.errorText}>{errorMsg}</Text> : null}
      </Animated.View>
    </View>
  );
}

function Reason({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={st.reasonRow}>
      <View style={st.reasonIcon}>
        <Ionicons name={icon} size={17} color={Colors.primary} />
      </View>
      <Text style={st.reasonText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,17,17,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 18, left: 20,
    width: 30, height: 30,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 26,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 16,
  },
  pushCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(28,28,30,0.96)',
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 18,
  },
  pushIcon: {
    width: 38, height: 38,
    borderRadius: 9,
  },
  pushTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pushApp: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  pushNow: { color: 'rgba(255,255,255,0.4)', fontSize: 11.5 },
  pushTitle: { color: '#fff', fontSize: 13.5, fontWeight: '700', marginTop: 1 },
  pushBody: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 1 },
  reasons: { gap: 12, marginBottom: 22 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reasonIcon: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonText: { flex: 1, fontSize: 14, lineHeight: 19, color: Colors.textPrimary, fontWeight: '500' },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 2,
  },
  skipText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  enableBtn: {
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorText: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 17,
    color: Colors.red,
    textAlign: 'center',
  },
});
