import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { Colors } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  iconActive,
  iconInactive,
  label,
  focused,
  badge,
}: {
  iconActive: IoniconName;
  iconInactive: IoniconName;
  label: string;
  focused: boolean;
  badge?: number;
}) {
  return (
    <View style={styles.tabItem}>
      <View>
        <Ionicons
          name={focused ? iconActive : iconInactive}
          size={24}
          color={focused ? Colors.primary : '#9CA3AF'}
        />
        {badge && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.tabLabel, { color: focused ? Colors.primary : '#9CA3AF' }]}
        numberOfLines={1}
        ellipsizeMode="clip"
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const currentUser = app?.currentUser ?? null;
  const unreadCount = app?.unreadCount ?? 0;
  const likes = app?.likes ?? [];
  const vacancies = app?.vacancies ?? [];
  const isWorker = currentUser?.role === 'worker';

  const router = useRouter();

  // When currentUser is cleared (logout/delete), navigate to welcome screen.
  // useEffect fires after React commits state, so currentUser is guaranteed null here.
  useEffect(() => {
    if (!app?.loading && !currentUser) {
      router.replace('/');
    }
  }, [app?.loading, currentUser]);

  const matchBadge = (() => {
    if (!currentUser) return 0;
    if (isWorker) {
      // Pending (awaiting employer decision)
      const awaiting = likes.filter(l =>
        l.workerId === currentUser.id && l.workerLiked && l.employerLiked === null && !l.isMatch
      ).length;
      // Rejected by employer
      const rejected = likes.filter(l =>
        l.workerId === currentUser.id && l.workerLiked && l.employerLiked === false
      ).length;
      // Active matches (not yet completed, or completed but worker hasn't rated)
      const matched = likes.filter(l =>
        l.workerId === currentUser.id && l.isMatch && !l.shiftCompleted
      ).length;
      // Employer confirmed — worker needs to rate
      const needsRating = likes.filter(l =>
        l.workerId === currentUser.id && l.isMatch && l.shiftCompleted && !l.workerRated
      ).length;
      return awaiting + rejected + matched + needsRating;
    }
    const myVacIds = vacancies.filter(v => v.employerId === currentUser.id).map(v => v.id);
    // Pending applications awaiting employer decision
    const pending = likes.filter(l =>
      myVacIds.includes(l.vacancyId) && l.workerLiked && l.employerLiked === null && !l.isMatch
    ).length;
    // Active matches (not yet completed)
    const matched = likes.filter(l =>
      myVacIds.includes(l.vacancyId) && l.isMatch && !l.shiftCompleted
    ).length;
    // Shift completed but employer hasn't rated yet
    const needsRating = likes.filter(l =>
      myVacIds.includes(l.vacancyId) && l.isMatch && l.shiftCompleted && !l.employerRated
    ).length;
    return pending + matched + needsRating;
  })();

  // Hide the splash (web overlay or native splash) once tabs are rendered
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const tabBarHeight = Platform.select({
    ios: insets.bottom + 60,
    android: insets.bottom + 60,
    default: 66,
  });

  return (
    <Tabs
      initialRouteName="feed"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: Platform.select({
            ios: insets.bottom + 6,
            android: insets.bottom + 6,
            default: 8,
          }),
          backgroundColor: Colors.bg,
          borderTopWidth: 1,
          borderTopColor: Colors.divider,
        },
        tabBarShowLabel: false,
      }}
    >
      {/* Home: search (worker) or vacancies (employer) */}
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconActive={isWorker ? 'search' : 'briefcase'}
              iconInactive={isWorker ? 'search-outline' : 'briefcase-outline'}
              label={isWorker ? 'Поиск' : 'Вакансии'}
              focused={focused}
            />
          ),
        }}
      />

      {/* Hide the old index redirect from the tab bar */}
      <Tabs.Screen name="index" options={{ href: null }} />

      {/* Saved — hidden from tab bar */}
      <Tabs.Screen name="saved" options={{ href: null }} />

      {/* Matches */}
      <Tabs.Screen
        name="matches"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconActive="people"
              iconInactive="people-outline"
              label="Мэтчи"
              focused={focused}
              badge={matchBadge}
            />
          ),
        }}
      />

      {/* Chats */}
      <Tabs.Screen
        name="chats"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconActive="chatbubble"
              iconInactive="chatbubble-outline"
              label="Чаты"
              focused={focused}
              badge={unreadCount}
            />
          ),
        }}
      />

      {/* Profile */}
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              iconActive="person"
              iconInactive="person-outline"
              label="Профиль"
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 2, minWidth: 52 },
  tabLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  badge: {
    position: 'absolute', top: -4, right: -8,
    backgroundColor: Colors.primary, borderRadius: 100,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
