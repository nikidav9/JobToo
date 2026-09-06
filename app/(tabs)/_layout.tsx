import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs } from 'expo-router';
import {
  Platform, View, Text, StyleSheet, PanResponder, Dimensions, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bottomSafe } from '@/lib/androidInsets';
import { StackActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import NotificationPermissionSheet from '@/components/NotificationPermissionSheet';
import CompleteProfileSheet from '@/components/CompleteProfileSheet';
import EntryTransition from '@/components/EntryTransition';
import { OnboardingOverlay } from '@/components/OnboardingOverlay';
import { setOnboardingTarget, registerOnboardingMeasurer } from '@/lib/onboardingTargets';
import { matchBadgeCount } from '@/services/matchCounts';

import { rs, rf } from '@/constants/scale';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ROUTES = ['feed', 'career', 'matches', 'chats', 'profile'] as const;

// ─── Floating tab bar ───────────────────────────────────────────────────────

interface TabDef {
  route: string;
  iconFilled: IoniconName;
  iconOutline: IoniconName;
  label: string;
  badge?: number;
}

const PILL_PADDING = 6;   // paddingHorizontal on the pill
const INDICATOR_MARGIN = 4; // gap between indicator and tab slot edge

function FloatingTabBar({
  state,
  navigation,
  tabs,
}: {
  state: any;
  navigation: any;
  tabs: TabDef[];
}) {
  const insets = useSafeAreaInsets();
  // На части прошивок insets.bottom приходит нулём, хотя панель кнопок
  // есть — меряем её отдельно, иначе плашка вкладок садится под
  // системные «назад/домой».
  const safeBottom = bottomSafe(insets.bottom);
  const screenWidth = Dimensions.get('window').width;
  const [pillWidth, setPillWidth] = useState(0);

  // Animated value = floating-point tab index (e.g. 1.5 while sliding)
  const animIndex = useRef(new Animated.Value(0)).current;

  // Вкладка «Мэтчи» — цель подсветки в обучении. Меряем по ссылке, а не по
  // событию раскладки: e.currentTarget в onLayout не всегда умеет
  // measureInWindow, и вызов молча пропускался — подсветка оставалась без
  // координат. И оставляем способ перемерить: первый замер на iOS часто
  // возвращает нули, а второй попытки раньше не было.
  const matchesTabRef = useRef<View>(null);
  const measureMatchesTab = useCallback(() => {
    matchesTabRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setOnboardingTarget('matchesTab', { x, y, w, h });
    });
  }, []);
  useEffect(() => registerOnboardingMeasurer('matchesTab', measureMatchesTab), [measureMatchesTab]);

  // Which of our tabs is currently focused
  const focusedTabIdx = Math.max(0, tabs.findIndex(t => {
    const ri = state.routes.findIndex((r: any) => r.name === t.route);
    return ri === state.index;
  }));

  useEffect(() => {
    Animated.spring(animIndex, {
      toValue: focusedTabIdx,
      tension: 85,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, [focusedTabIdx]);

  // Indicator geometry
  const tabSlotWidth = pillWidth > 0
    ? (pillWidth - PILL_PADDING * 2) / tabs.length
    : 80;
  const indicatorW = tabSlotWidth - INDICATOR_MARGIN * 2;

  const indicatorX = animIndex.interpolate({
    inputRange: tabs.map((_, i) => i),
    outputRange: tabs.map((_, i) => PILL_PADDING + INDICATOR_MARGIN + i * tabSlotWidth),
    extrapolate: 'clamp',
  });

  // Always-fresh pointer handler (PanResponder closure is stale by design)
  const handleRef = useRef<(pageX: number) => void>(() => {});
  handleRef.current = (pageX: number) => {
    const pillLeft = 16 + PILL_PADDING;
    const pillInnerWidth = screenWidth - pillLeft * 2;
    const relX = pageX - pillLeft;
    const idx = Math.max(0, Math.min(tabs.length - 1, Math.floor(relX / (pillInnerWidth / tabs.length))));
    const routeIdx = state.routes.findIndex((r: any) => r.name === tabs[idx]?.route);
    if (routeIdx >= 0 && state.index !== routeIdx) {
      navigation.navigate(state.routes[routeIdx].name);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleRef.current(e.nativeEvent.pageX),
      onPanResponderMove: (e) => handleRef.current(e.nativeEvent.pageX),
    }),
  ).current;

  // Web: PanResponder doesn't intercept mouse — add explicit handlers
  const webHandlers = Platform.OS === 'web' ? {
    onMouseDown: (e: any) => handleRef.current(e.pageX ?? e.clientX ?? 0),
    onMouseMove: (e: any) => { if (e.buttons > 0) handleRef.current(e.pageX ?? e.clientX ?? 0); },
    onTouchStart: (e: any) => handleRef.current(e.touches?.[0]?.pageX ?? 0),
    onTouchMove: (e: any) => handleRef.current(e.touches?.[0]?.pageX ?? 0),
  } : {};

  return (
    <>
    {/* White background covering safe-area gap under the pill */}
    {safeBottom > 0 && (
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: safeBottom + 12, backgroundColor: '#fff',
      }} />
    )}
    {/* Outer: shadow (overflow:hidden would clip Android elevation) */}
    <View
      style={[fS.pillShadow, { bottom: safeBottom + 12 }]}
      onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
      {...webHandlers}
    >
      {/* Inner: clips blur + indicator to rounded shape */}
      <View style={fS.pillClip}>
        {/* Frosted glass background */}
        <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
        {/* Semi-transparent overlay for contrast on dark content */}
        <View style={fS.pillTint} />

        {/* Sliding active indicator */}
        {pillWidth > 0 && (
          <Animated.View
            style={[fS.indicator, { width: indicatorW, transform: [{ translateX: indicatorX }] }]}
          />
        )}

        {/* Tab items — rendered on top of indicator */}
        <View style={fS.tabsRow}>
          {tabs.map((tab) => {
            const routeIndex = state.routes.findIndex((r: any) => r.name === tab.route);
            const focused = routeIndex >= 0 && state.index === routeIndex;
            return (
              <View
                key={tab.route}
                style={fS.tabItem}
                ref={tab.route === 'matches' ? matchesTabRef : undefined}
                onLayout={tab.route === 'matches' ? measureMatchesTab : undefined}
              >
                <View>
                  <Ionicons
                    name={focused ? tab.iconFilled : tab.iconOutline}
                    size={22}
                    color={Colors.primary}
                  />
                  {tab.badge && tab.badge > 0 ? (
                    <View style={fS.badge}>
                      <Text style={fS.badgeText}>{tab.badge > 9 ? '9+' : tab.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[fS.label, focused && fS.labelActive]}>
                  {tab.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
    </>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const currentUser = app?.currentUser ?? null;
  const unreadCount = app?.unreadCount ?? 0;
  const likes = app?.likes ?? [];
  const vacancies = app?.vacancies ?? [];
  const permApplications = app?.permApplications ?? [];
  const isWorker = currentUser?.role === 'worker';
  const navigation = useNavigation();
  const splashFrameRef = useRef(0);

  useEffect(() => {
    if (!app?.loading && !currentUser) {
      navigation.dispatch(StackActions.replace('index'));
    }
  }, [app?.loading, currentUser]);

  useEffect(() => {
    // На части Android-устройств hideAsync в первый effect успевает убрать
    // системный splash до того, как EntryTransition отрисовал первый кадр.
    // Два кадра дают React Native завершить layout и исключают белое окно.
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => {});
      });
      splashFrameRef.current = second;
    });
    splashFrameRef.current = first;
    return () => cancelAnimationFrame(splashFrameRef.current);
  }, []);

  // ─── Match badge ─────────────────────────────────────────────────────────
  // Считаем тем же кодом, что и вкладки внутри экрана, — см. services/matchCounts.ts.
  const matchBadge = currentUser
    ? matchBadgeCount({
        role: isWorker ? 'worker' : 'employer',
        userId: currentUser.id,
        likes, vacancies, permApplications,
      })
    : 0;

  // Работник: смены и постоянная работа разведены на две вкладки
  // (Подработка / Карьера). Директор пока живёт по-старому: одна вкладка
  // «Вакансии» с внутренним переключателем смен и постоянных.
  const tabs: TabDef[] = isWorker
    ? [
        { route: 'feed', iconFilled: 'time', iconOutline: 'time-outline', label: 'Подработка' },
        { route: 'career', iconFilled: 'briefcase', iconOutline: 'briefcase-outline', label: 'Карьера' },
        { route: 'matches', iconFilled: 'people', iconOutline: 'people-outline', label: 'Мэтчи', badge: matchBadge },
        { route: 'chats', iconFilled: 'chatbubble', iconOutline: 'chatbubble-outline', label: 'Общение', badge: unreadCount },
        { route: 'profile', iconFilled: 'person', iconOutline: 'person-outline', label: 'Профиль' },
      ]
    : [
        { route: 'feed', iconFilled: 'briefcase', iconOutline: 'briefcase-outline', label: 'Вакансии' },
        { route: 'matches', iconFilled: 'people', iconOutline: 'people-outline', label: 'Мэтчи', badge: matchBadge },
        { route: 'chats', iconFilled: 'chatbubble', iconOutline: 'chatbubble-outline', label: 'Чаты', badge: unreadCount },
        { route: 'profile', iconFilled: 'person', iconOutline: 'person-outline', label: 'Профиль' },
      ];

  // ─── Tab bar height (keeps useBottomTabBarHeight working in screens) ──────
  const tabBarHeight = Platform.select({
    ios: insets.bottom + 64 + 12,
    android: bottomSafe(insets.bottom) + 64 + 12,
    default: 76,
  });

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="feed"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            height: tabBarHeight,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarBackground: () => null,
          tabBarShowLabel: false,
        }}
        tabBar={(props) => (
          <FloatingTabBar
            state={props.state}
            navigation={props.navigation}
            tabs={tabs}
          />
        )}
      >
        <Tabs.Screen name="feed" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="career" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="matches" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="chats" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="profile" options={{ tabBarIcon: () => null }} />
      </Tabs>
      <NotificationPermissionSheet />
      <CompleteProfileSheet />
      <EntryTransition />
      <OnboardingOverlay />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const fS = StyleSheet.create({
  // Outer view: carries the shadow (can't use overflow:hidden here on Android)
  pillShadow: {
    position: 'absolute',
    left: rs(16),
    right: rs(16),
    height: rs(64),
    borderRadius: rs(28),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 20,
    elevation: 12,
  },
  // Inner view: clips blur + indicator to pill shape
  pillClip: {
    flex: 1,
    borderRadius: rs(28),
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
  },
  // Sliding orange indicator
  indicator: {
    position: 'absolute',
    top: rs(10),     // (64 - 44) / 2
    height: rs(44),
    borderRadius: rs(20),
    backgroundColor: Colors.primaryLight,
  },
  // Row of tab items, laid on top of the indicator
  tabsRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PILL_PADDING,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(3),
  },
  label: {
    fontSize: rf(10),
    fontWeight: '600',
    color: Colors.primary,
    opacity: 0.45,
  },
  labelActive: {
    opacity: 1,
  },
  badge: {
    position: 'absolute',
    top: rs(-4),
    right: rs(-8),
    backgroundColor: Colors.primary,
    borderRadius: rs(100),
    minWidth: rs(16),
    height: rs(16),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(3),
  },
  badgeText: { color: '#fff', fontSize: rf(9), fontWeight: '700' },
});
