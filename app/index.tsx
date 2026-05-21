import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { Asset } from 'expo-asset';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';

const TRACK_W = 140;

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
  const progress = useRef(new Animated.Value(0)).current;
  const slowAnim = useRef<Animated.CompositeAnimation | null>(null);
  const finishing = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Asset.loadAsync([
      require('../assets/images/char-employer-crop.png'),
      require('../assets/images/char-worker-crop.png'),
    ]);
  }, []);

  useEffect(() => {
    slowAnim.current = Animated.sequence([
      Animated.timing(progress, { toValue: TRACK_W * 0.55, duration: 350, useNativeDriver: false }),
      Animated.timing(progress, { toValue: TRACK_W * 0.88, duration: 3500, useNativeDriver: false }),
    ]);
    slowAnim.current.start();
  }, []);

  useEffect(() => {
    if (loading || finishing.current) return;
    finishing.current = true;
    slowAnim.current?.stop();
    Animated.timing(progress, { toValue: TRACK_W, duration: 220, useNativeDriver: false }).start(() => {
      if (currentUser) {
        router.replace('/(tabs)');
      } else {
        setReady(true);
      }
    });
  }, [loading, currentUser]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.splashCenter}>
          <Text style={styles.splashLogo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width: progress }]} />
          </View>
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

        {/* ══ Карточка 1: Ищу работника (оранжевая) ══ */}
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.9}
          onPress={() => router.push('/register-employer')}
        >
          <View style={[StyleSheet.absoluteFill, styles.bgOrange]} />

          <Image
            source={require('../assets/images/char-employer-crop.png')}
            style={[styles.charImg, { width: EMPL_W, height: EMPL_H, right: EMPL_RIGHT }]}
            resizeMode="contain"
          />

          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>Ищу{'\n'}работника</Text>
            <Text style={[styles.cardSub, styles.cardSubOrange]}>
              {'Размещайте вакансии\nи находите сотрудников'}
            </Text>
          </View>

          <View style={[styles.arrowBtn, { right: r(13) }]}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ══ Карточка 2: Ищу подработку (тёмная) ══ */}
        <TouchableOpacity
          style={[styles.card, { marginTop: CARD2_MT }]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          <View style={[StyleSheet.absoluteFill, styles.bgDark]} />

          <Image
            source={require('../assets/images/char-worker-crop.png')}
            style={[styles.charImg, { width: WORK_W, height: WORK_H, right: WORK_RIGHT }]}
            resizeMode="contain"
          />

          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>Ищу{'\n'}подработку</Text>
            <Text style={styles.cardSub}>{'Находите подработки\nна складах'}</Text>
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

        {/* Спейсер — прижимает логин и версию к низу экрана */}
        <View style={{ flex: 1, minHeight: r(12) }} />

        {/* ── Вход ── */}
        <View style={styles.loginCard}>
          <Text style={styles.loginGray}>Уже есть аккаунт? </Text>
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginLink}>Войти</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>JobToo v1.1</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FA' },

  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashLogo: { fontSize: 44 },
  track: {
    width: TRACK_W, height: 3, backgroundColor: Colors.inputBorder,
    borderRadius: 100, overflow: 'hidden', marginTop: 28,
  },
  fill: { height: 3, backgroundColor: Colors.primary, borderRadius: 100 },

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
});
