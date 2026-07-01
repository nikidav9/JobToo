import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Image, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { Asset } from 'expo-asset';
import * as SplashScreen from 'expo-splash-screen';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LogoDots } from '@/components/EntryTransition';
import { hideWebSplash } from '@/lib/webSplash';

const USER_COUNT_KEY = 'cached_user_count';

const { width: SW, height: SH } = Dimensions.get('window');
const sc = Math.min(SW / 390, SH / 844);
const r = (n: number) => Math.round(n * sc);

// Figma: фрейм 265px → телефон 390px → масштаб 1.474
// Карточки в Figma: 211×94px
const CARD_H = r(156);

// Персонаж работодателя: 77×104 в Figma, right-отступ 42px
const EMPL_W     = r(119);
const EMPL_H     = r(169);
const EMPL_RIGHT = r(62);

// Персонаж работника: 78×98 в Figma, right-отступ 35px
const WORK_W     = r(123);
const WORK_H     = r(160);
const WORK_RIGHT = r(52);

// Зазор между карточками: 12px + overflow 4px = 16px × 1.474
const CARD2_MT = r(18);


export default function RootScreen() {
  const router = useRouter();
  const { currentUser, loading } = useApp();
  const finishing = useRef(false);
  // true if loading was already false when this component mounted (post-logout navigation)
  const skipSplash = useRef(!loading);
  const [ready, setReady] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [userCountReady, setUserCountReady] = useState(false);
  // Always holds latest currentUser — avoids stale closure inside animation callback
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    Asset.loadAsync([
      require('../assets/images/char-employer-crop.png'),
      require('../assets/images/char-worker-crop.png'),
    ]);
  }, []);

  useEffect(() => {
    // Показываем кэшированное значение сразу
    AsyncStorage.getItem(USER_COUNT_KEY).then(cached => {
      if (cached) { setUserCount(Number(cached)); setUserCountReady(true); }
    }).catch(() => {});
    // Затем обновляем свежими данными
    supabase.from('jm_users').select('id', { count: 'exact', head: true })
      .then(({ count }) => {
        if (count != null) {
          setUserCount(count);
          setUserCountReady(true);
          AsyncStorage.setItem(USER_COUNT_KEY, String(count)).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Post-logout: loading was already false when we mounted — skip splash, show screen now
    if (skipSplash.current && !loading) {
      SplashScreen.hideAsync().catch(() => {});
      if (currentUserRef.current) {
        router.replace('/(tabs)');
      } else {
        hideWebSplash();
        setReady(true);
      }
      return;
    }

    if (loading || finishing.current) return;
    finishing.current = true;
    // Read from ref so we get the committed value, not a stale closure
    if (currentUserRef.current) {
      // Loading screen hides once tabs are mounted and data is ready:
      // native — EntryTransition overlay, web — the static HTML splash.
      router.replace('/(tabs)');
    } else {
      // No tabs will mount — hide splash now and show the welcome screen
      SplashScreen.hideAsync().catch(() => {});
      hideWebSplash();
      setReady(true);
    }
  }, [loading, currentUser]);

  if (!ready) {
    // Web: the static HTML splash (app/+html.tsx) is the single loading
    // screen — render nothing so there is no second screen behind it.
    if (Platform.OS === 'web') return null;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.splashCenter}>
          <LogoDots />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={false}
      >
        {/* Спейсер вверху — на больших экранах отступ идёт над логотипом */}
        <View style={{ minHeight: r(8) }} />

        {/* ── Лого ── */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <Text style={styles.tagline}>Подработки на складах в Москве</Text>
        </View>

        {/* ── Заголовок ── */}
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>{'Выберите,\nкто вы'}</Text>
          <Text style={styles.headlineSub}>{'Мы адаптируем приложение\nпод ваши задачи'}</Text>
        </View>

        {/* ══ Карточка 1: Ищу подработку (оранжевая) ══ */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          <View style={[StyleSheet.absoluteFill, styles.bgOrange]} />

          <Image
            source={require('../assets/images/char-employer-crop.png')}
            style={[styles.charImg, { width: EMPL_W, height: EMPL_H, right: EMPL_RIGHT }]}
            resizeMode="contain"
          />

          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>Ищу{'\n'}подработку</Text>
            <Text style={[styles.cardSub, styles.cardSubOrange]}>
              {'Находите подработки\nна складах'}
            </Text>
          </View>

          <View style={[styles.arrowBtn, { right: r(13) }]}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ══ Карточка 2: Ищу работника (тёмная) ══ */}
        <TouchableOpacity
          style={[styles.card, { marginTop: CARD2_MT }]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-employer')}
        >
          <View style={[StyleSheet.absoluteFill, styles.bgDark]} />

          <Image
            source={require('../assets/images/char-worker-crop.png')}
            style={[styles.charImg, { width: WORK_W, height: WORK_H, right: WORK_RIGHT }]}
            resizeMode="contain"
          />

          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>Ищу{'\n'}работника</Text>
            <Text style={styles.cardSub}>{'Размещайте вакансии\nи находите сотрудников'}</Text>
          </View>

          <View style={[styles.arrowBtn, { right: r(8) }]}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ── Преимущества ── */}
        <View style={styles.featuresRow}>
          <View style={styles.feature}>
            <Image
              source={require('../assets/images/icon-security.png')}
              style={styles.featureIcon}
              resizeMode="contain"
            />
            <Text style={styles.featureTitle}>Безопасно</Text>
            <Text style={styles.featureSub}>{'Проверенные\nкомпании'}</Text>
          </View>

          <View style={styles.feature}>
            <Image
              source={require('../assets/images/icon-flash.png')}
              style={styles.featureIcon}
              resizeMode="contain"
            />
            <Text style={styles.featureTitle}>Быстро</Text>
            <Text style={styles.featureSub}>{'Отклики и подбор\nза 1 день'}</Text>
          </View>

          <View style={styles.feature}>
            <Star size={r(20)} color={Colors.primary} fill={Colors.primary} />
            <Text style={styles.featureTitle}>Надёжно</Text>
            <Text style={styles.featureSub}>{'Поддержка\n24/7'}</Text>
          </View>
        </View>

        {/* ── Счётчик пользователей ── */}
        <View style={styles.userCountCard}>
          <View style={styles.avatarsStack}>
            {[
              { color: '#FF6B1A', letter: 'А' },
              { color: '#2563EB', letter: 'М' },
              { color: '#16A34A', letter: 'К' },
              { color: '#7C3AED', letter: 'Д' },
            ].map((a, i) => (
              <View key={i} style={[styles.avatarCircle, { backgroundColor: a.color, left: i * r(16) }]}>
                <Text style={styles.avatarLetter}>{a.letter}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.userCountTxt}>
            {userCountReady && userCount != null
              ? <>Более <Text style={styles.userCountNum}>{userCount.toLocaleString('ru')}</Text> пользователей уже с нами!</>
              : 'Уже тысячи с нами!'
            }
          </Text>
        </View>

        {/* Спейсер — прижимает логин и версию к низу экрана */}
        <View style={{ flex: 1, minHeight: r(12) }} />

        {/* ── Вход ── */}
        <View style={styles.loginCard}>
          <Text style={styles.loginGray}>Уже есть аккаунт? </Text>
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginLink}>Войти</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>JobToo v3.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },

  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: r(20),
    paddingTop: r(10),
    paddingBottom: r(12),
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
  },

  logoRow: { marginBottom: r(16) },
  logo: { fontSize: r(37) },
  logoBlack: { fontWeight: '800', color: '#111111' },
  logoOrange: { fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: r(15), color: Colors.textSecondary, marginTop: r(4) },

  headlineBlock: { marginBottom: r(20) },
  headline: {
    fontSize: r(42), fontWeight: '800', color: '#111111', lineHeight: r(48),
  },
  headlineSub: {
    fontSize: r(16), color: Colors.textSecondary,
    marginTop: r(8), lineHeight: r(22),
  },

  card: {
    height: CARD_H,
    overflow: 'visible',
  },

  bgOrange: { backgroundColor: '#FF5500', borderRadius: r(20), overflow: 'hidden' },
  bgDark:   { backgroundColor: '#1E2225', borderRadius: r(20), overflow: 'hidden' },

  charImg: {
    position: 'absolute',
    bottom: 0,
  },

  cardLeft: {
    position: 'absolute',
    left: r(18),
    top: r(0),
    bottom: r(0),
    right: r(185),
    justifyContent: 'center',
  },

  cardTitle: {
    fontSize: r(22), fontWeight: '800', color: '#FFFFFF',
    lineHeight: r(27), marginBottom: r(5),
  },
  cardSub: {
    fontSize: r(13), color: 'rgba(255,255,255,0.65)', lineHeight: r(18),
  },
  cardSubOrange: {
    color: '#FFC69C',
  },

  arrowBtn: {
    position: 'absolute',
    top: CARD_H / 2 - r(18),
    width: r(36), height: r(36), borderRadius: r(18),
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  arrowTxt: { fontSize: r(21), color: '#111111', lineHeight: r(26), marginLeft: 2 },

  featuresRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: r(14), marginBottom: r(10),
  },
  feature: { flex: 1, alignItems: 'center', paddingHorizontal: r(4), gap: r(3) },
  featureIcon: { width: r(20), height: r(20) },
  featureTitle: { fontSize: r(12), fontWeight: '700', color: '#111111' },
  featureSub: { fontSize: r(10), color: Colors.textSecondary, textAlign: 'center', lineHeight: r(14) },

  loginCard: {
    backgroundColor: '#FFFFFF', borderRadius: r(14),
    paddingVertical: r(13),
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: r(10),
  },
  loginGray: { fontSize: r(15), color: '#111111' },
  loginLink: { fontSize: r(15), fontWeight: '900', color: Colors.primary },

  version: { textAlign: 'center', fontSize: r(12), color: '#6B7280' },
  userCountCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    marginTop: r(10), marginBottom: r(2),
    paddingVertical: r(5), paddingHorizontal: r(10),
    backgroundColor: '#FFFFFF',
    borderRadius: r(20),
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: r(7),
  },
  avatarsStack: {
    position: 'relative',
    width: r(16) * 3 + r(24),
    height: r(24),
  },
  avatarCircle: {
    position: 'absolute',
    width: r(24), height: r(24), borderRadius: r(12),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  avatarLetter: { fontSize: r(9), fontWeight: '700', color: '#fff' },
  userCountTxt: { fontSize: r(12), color: Colors.textSecondary },
  userCountNum: { fontWeight: '700', color: Colors.primary },
});
