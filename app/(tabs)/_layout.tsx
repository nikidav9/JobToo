import React, { useEffect, useRef } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import {
  Platform, View, Text, StyleSheet, PanResponder, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ROUTES = ['feed', 'matches', 'chats', 'profile'] as const;

// ─── Floating tab bar ───────────────────────────────────────────────────────

interface TabDef {
  route: string;
  iconFilled: IoniconName;
  iconOutline: IoniconName;
  label: string;
  badge?: number;
}

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
  const screenWidth = Dimensions.get('window').width;

  // Always-fresh handler ref — PanResponder is created once but reads latest state
  const handleRef = useRef<(pageX: number) => void>(() => {});
  handleRef.current = (pageX: number) => {
    // pill: left=16 + paddingHorizontal=6 on each side
    const pillLeft = 16 + 6;
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

  // Web: PanResponder doesn't intercept mouse events — add explicit handlers
  const webHandlers = Platform.OS === 'web' ? {
    onMouseDown: (e: any) => handleRef.current(e.pageX ?? e.clientX ?? 0),
    onMouseMove: (e: any) => { if (e.buttons > 0) handleRef.current(e.pageX ?? e.clientX ?? 0); },
    onTouchStart: (e: any) => handleRef.current(e.touches?.[0]?.pageX ?? 0),
    onTouchMove: (e: any) => handleRef.current(e.touches?.[0]?.pageX ?? 0),
  } : {};

  return (
    <View
      style={[fS.pill, { bottom: insets.bottom + 12 }]}
      {...panResponder.panHandlers}
      {...webHandlers}
    >
      {tabs.map((tab) => {
        const routeIndex = state.routes.findIndex((r: any) => r.name === tab.route);
        const focused = routeIndex >= 0 && state.index === routeIndex;
        return (
          <View key={tab.route} style={fS.tabItem}>
            <View style={[fS.tabInner, focused && fS.tabInnerActive]}>
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
          </View>
        );
      })}
    </View>
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
  const isWorker = currentUser?.role === 'worker';
  const navigation = useNavigation();

  useEffect(() => {
    if (!app?.loading && !currentUser) {
      navigation.dispatch(StackActions.replace('index'));
    }
  }, [app?.loading, currentUser]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // ─── Match badge ─────────────────────────────────────────────────────────
  const matchBadge = (() => {
    if (!currentUser) return 0;
    if (isWorker) {
      const awaiting = likes.filter(l =>
        l.workerId === currentUser.id && l.workerLiked && l.employerLiked === null && !l.isMatch
      ).length;
      const rejected = likes.filter(l =>
        l.workerId === currentUser.id && l.workerLiked && l.employerLiked === false
      ).length;
      const matched = likes.filter(l =>
        l.workerId === currentUser.id && l.isMatch && !l.shiftCompleted
      ).length;
      const needsRating = likes.filter(l =>
        l.workerId === currentUser.id && l.isMatch && l.shiftCompleted && !l.workerRated
      ).length;
      return awaiting + rejected + matched + needsRating;
    }
    const myVacIds = vacancies.filter(v => v.employerId === currentUser.id).map(v => v.id);
    const pending = likes.filter(l =>
      myVacIds.includes(l.vacancyId) && l.workerLiked && l.employerLiked === null && !l.isMatch
    ).length;
    const matched = likes.filter(l =>
      myVacIds.includes(l.vacancyId) && l.isMatch && !l.shiftCompleted
    ).length;
    const needsRating = likes.filter(l =>
      myVacIds.includes(l.vacancyId) && l.isMatch && l.shiftCompleted && !l.employerRated
    ).length;
    return pending + matched + needsRating;
  })();

  const tabs: TabDef[] = [
    {
      route: 'feed',
      iconFilled: isWorker ? 'search' : 'briefcase',
      iconOutline: isWorker ? 'search-outline' : 'briefcase-outline',
      label: isWorker ? 'Поиск' : 'Вакансии',
    },
    { route: 'matches', iconFilled: 'people', iconOutline: 'people-outline', label: 'Мэтчи', badge: matchBadge },
    { route: 'chats', iconFilled: 'chatbubble', iconOutline: 'chatbubble-outline', label: 'Чаты', badge: unreadCount },
    { route: 'profile', iconFilled: 'person', iconOutline: 'person-outline', label: 'Профиль' },
  ];

  // ─── Tab bar height (keeps useBottomTabBarHeight working in screens) ──────
  const tabBarHeight = Platform.select({
    ios: insets.bottom + 64 + 12,
    android: insets.bottom + 64 + 12,
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
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="matches" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="chats" options={{ tabBarIcon: () => null }} />
        <Tabs.Screen name="profile" options={{ tabBarIcon: () => null }} />
      </Tabs>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const fS = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 28,
    backgroundColor: Colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tabInnerActive: {
    backgroundColor: Colors.primaryLight,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    opacity: 0.45,
  },
  labelActive: {
    opacity: 1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: Colors.primary,
    borderRadius: 100,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
