import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SplashLoader, { useLoadingPercent, DrawnArt, bootElapsed, SPLASH_MIN_MS } from '@/components/SplashLoader';
import { ICON_WORKER, ICON_EMPLOYER } from '@/constants/roleIcons';
import { Ionicons } from '@expo/vector-icons';
import { hideWebSplash } from '@/lib/webSplash';

import { rs, rf } from '@/constants/scale';
import { dbCountUsers } from '@/services/db';

const USER_COUNT_KEY = 'cached_user_count';

const { width: SW, height: SH } = Dimensions.get('window');
const sc = Math.min(SW / 390, SH / 844);
const r = (n: number) => Math.round(n * sc);



export default function RootScreen() {
  const router = useRouter();
  const { currentUser, loading } = useApp();
  const finishing = useRef(false);
  // true if loading was already false when this component mounted (post-logout navigation)
  const skipSplash = useRef(!loading);
  const [ready, setReady] = useState(false);
  // Счётчик на загрузочном экране: добегает до 100 %, когда стартовые данные готовы
  const bootPercent = useLoadingPercent(!loading);
  // Текст и второстепенные блоки проявляются, пока рисуются иконки ролей
  const introFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready) return;
    Animated.timing(introFade, {
      toValue: 1, duration: 420, delay: 80, useNativeDriver: true,
    }).start();
  }, [ready]);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [userCountReady, setUserCountReady] = useState(false);
  // Always holds latest currentUser — avoids stale closure inside animation callback
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    // Показываем кэшированное значение сразу
    AsyncStorage.getItem(USER_COUNT_KEY).then(cached => {
      if (cached) { setUserCount(Number(cached)); setUserCountReady(true); }
    }).catch(() => {});
    // Затем обновляем свежими данными.
    // Через прокси, а не напрямую в базу: с закрытием базы прямой запрос стал
    // получать отказ, и экран навсегда застревал на числе из кэша телефона —
    // в дашборде было 357, а здесь 351.
    dbCountUsers()
      .then(count => {
        if (count > 0) {
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
    // Даже если грузить нечего, даём логотипу дорисоваться, а счётчику —
    // добежать до 100 %: иначе экран мелькает и пропадает недорисованным.
    const wait = Math.max(0, SPLASH_MIN_MS - bootElapsed());
    const t = setTimeout(() => {
      // Read from ref so we get the committed value, not a stale closure
      if (currentUserRef.current) {
        // Loading screen hides once tabs are mounted and data is ready:
        // native — EntryTransition overlay, web — the static HTML splash.
        router.replace('/(tabs)');
      } else {
        // No tabs will mount — hide splash now and show the welcome screen
        hideWebSplash();
        setReady(true);
      }
    }, wait);
    return () => clearTimeout(t);
  }, [loading, currentUser]);

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    // Сначала рисуем приветственный экран и только затем убираем системный
    // splash. Иначе Android на медленном устройстве показывает белый кадр.
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(() => SplashScreen.hideAsync().catch(() => {}));
    });
    return () => cancelAnimationFrame(first);
  }, [ready]);

  if (!ready) {
    // Web: the static HTML splash (app/+html.tsx) is the single loading
    // screen — render nothing so there is no second screen behind it.
    if (Platform.OS === 'web') return null;
    return <SplashLoader percent={bootPercent} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEnabled={false}
      >
        <View style={{ minHeight: r(8) }} />

        {/* ── Лого ── */}
        <Animated.View style={[styles.logoRow, { opacity: introFade }]}>
          <Text style={styles.logo}>
            <Text style={styles.logoDark}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <Text style={styles.tagline}>Подработки на складах в Москве</Text>
        </Animated.View>

        {/* ── Заголовок ── */}
        <Animated.View style={[styles.headlineBlock, { opacity: introFade }]}>
          <Text style={styles.headline}>{'Выберите,\nкто вы'}</Text>
          <Text style={styles.headlineSub}>{'Мы адаптируем приложение\nпод ваши задачи'}</Text>
        </Animated.View>

        {/* ══ Карточка 1: Ищу подработку ══ */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => router.push('/register-worker')}
        >
          <View style={styles.cardIcon}>
            <DrawnArt
              strokes={ICON_WORKER}
              viewBox="0 0 100 100"
              width={r(72)}
              height={r(72)}
              duration={900}
              delay={120}
              color={Colors.primary}
            />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Ищу подработку</Text>
            <Text style={styles.cardSub}>{'Смены на складах —\nвыходите когда удобно'}</Text>
          </View>
          <View style={styles.arrowBtn}>
            <Ionicons name="chevron-forward" size={r(18)} color={Colors.primary} />
          </View>
        </TouchableOpacity>

        {/* ══ Карточка 2: Ищу работника ══ */}
        <TouchableOpacity
          style={[styles.card, { marginTop: r(16) }]}
          activeOpacity={0.85}
          onPress={() => router.push('/register-employer')}
        >
          <View style={styles.cardIcon}>
            <DrawnArt
              strokes={ICON_EMPLOYER}
              viewBox="0 0 100 100"
              width={r(72)}
              height={r(72)}
              duration={900}
              delay={560}
              color={Colors.primary}
            />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Ищу работника</Text>
            <Text style={styles.cardSub}>{'Размещайте вакансии\nи находите сотрудников'}</Text>
          </View>
          <View style={styles.arrowBtn}>
            <Ionicons name="chevron-forward" size={r(18)} color={Colors.primary} />
          </View>
        </TouchableOpacity>

        {/* ── Преимущества ── */}
        <Animated.View style={[styles.featuresRow, { opacity: introFade }]}>
          <Text style={styles.featureTxt}>Проверенные компании</Text>
          <Text style={styles.featureDot}>·</Text>
          <Text style={styles.featureTxt}>Подбор за день</Text>
          <Text style={styles.featureDot}>·</Text>
          <Text style={styles.featureTxt}>Поддержка 24/7</Text>
        </Animated.View>

        {/* ── Счётчик пользователей ── */}
        <Animated.View style={[styles.userCountCard, { opacity: introFade }]}>
          <Text style={styles.userCountTxt}>
            {userCountReady && userCount != null
              ? <>Более <Text style={styles.userCountNum}>{userCount.toLocaleString('ru')}</Text> пользователей уже с нами!</>
              : 'Уже тысячи с нами!'
            }
          </Text>
        </Animated.View>

        <View style={{ flex: 1, minHeight: r(12) }} />

        {/* ── Вход ── */}
        <Animated.View style={[styles.loginCard, { opacity: introFade }]}>
          <Text style={styles.loginGray}>Уже есть аккаунт? </Text>
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginLink}>Войти</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.Text style={[styles.version, { opacity: introFade }]}>JobToo v3.0</Animated.Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Светлый фон: на этом экране человек читает и выбирает, поэтому сплошная
  // заливка цветом здесь утомляет — оранжевый остаётся только на загрузке.
  safe: { flex: 1, backgroundColor: '#F5F7FA' },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: r(20),
    paddingTop: r(10),
    paddingBottom: r(12),
    maxWidth: rs(430),
    width: '100%',
    alignSelf: 'center',
  },

  logoRow: { marginBottom: r(14) },
  logo: { fontSize: r(34), fontWeight: '800', letterSpacing: -0.8 },
  logoDark: { color: '#111111' },
  logoOrange: { color: Colors.primary },
  tagline: { fontSize: r(14), color: Colors.textSecondary, marginTop: r(4) },

  headlineBlock: { marginBottom: r(18) },
  headline: {
    fontSize: r(38), fontWeight: '800', color: '#111111', lineHeight: r(44),
  },
  headlineSub: {
    fontSize: r(15), color: Colors.textSecondary,
    marginTop: r(8), lineHeight: r(21),
  },

  // Карточка-обводка: белая линия по оранжевому — как весь рисованный стиль
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: r(14),
    borderWidth: 1.5,
    borderColor: Colors.inputBorder,
    borderRadius: r(20),
    backgroundColor: '#FFFFFF',
    paddingVertical: r(22),
    paddingLeft: r(16),
    paddingRight: r(12),
  },
  cardIcon: { width: r(72), height: r(72), alignItems: 'center', justifyContent: 'center' },
  cardTextWrap: { flex: 1 },
  cardTitle: {
    fontSize: r(20), fontWeight: '800', color: '#111111', marginBottom: r(4),
  },
  cardSub: {
    fontSize: r(13), color: Colors.textSecondary, lineHeight: r(18),
  },
  arrowBtn: {
    width: r(32), height: r(32), borderRadius: r(16),
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },

  featuresRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    flexWrap: 'wrap', gap: r(6),
    marginTop: r(16),
  },
  featureTxt: { fontSize: r(11.5), color: Colors.textSecondary },
  featureDot: { fontSize: r(11.5), color: Colors.textMuted },

  loginCard: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.inputBorder,
    borderRadius: r(14),
    paddingVertical: r(13),
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: r(10),
  },
  loginGray: { fontSize: r(15), color: '#111111' },
  loginLink: { fontSize: r(15), fontWeight: '900', color: Colors.primary },

  version: { textAlign: 'center', fontSize: r(12), color: Colors.textMuted },
  userCountCard: {
    alignSelf: 'center',
    marginTop: r(10),
    paddingVertical: r(6), paddingHorizontal: r(14),
    borderRadius: r(20),
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    backgroundColor: '#FFFFFF',
  },
  userCountTxt: { fontSize: r(12), color: Colors.textSecondary },
  userCountNum: { fontWeight: '800', color: Colors.primary },
});
