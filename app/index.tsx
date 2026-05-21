import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ScrollView, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';

const TRACK_W = 140;

// Масштаб: min по ширине И высоте — чтобы всё влезало на один экран
const { width: SW, height: SH } = Dimensions.get('window');
const sc = Math.min(SW / 390, SH / 844);
const r = (n: number) => Math.round(n * sc);

// ── Ключевые размеры (базовые для 390×844 iPhone 14) ──────────────────
const CARD_H  = r(160);

// char-employer.png: 1024×1536, W/H=0.667
// char_top = (160-420)+420*0.40 = -260+168 = -92px above card ✓
const EMPL_W  = r(280);
const EMPL_H  = r(420);

// char-worker.png: 1112×2400, W/H=0.463
// char_top = (160-420)+420*0.42 = -260+176 = -84px above card ✓
const WORK_W  = r(194);
const WORK_H  = r(420);

// Отступ перед второй карточкой: overflow(84px) + зазор(10px) = 94px
const CARD2_MT = r(94);

export default function RootScreen() {
  const router = useRouter();
  const { currentUser, loading } = useApp();
  const progress = useRef(new Animated.Value(0)).current;
  const slowAnim = useRef<Animated.CompositeAnimation | null>(null);
  const finishing = useRef(false);
  const [ready, setReady] = useState(false);

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
        {/* ── Лого ── */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <Text style={styles.tagline}>Подработки в Москве · Склад</Text>
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
            source={require('../assets/images/char-employer.png')}
            style={[styles.charImg, { width: EMPL_W, height: EMPL_H }]}
            resizeMode="contain"
          />

          <View style={styles.cardLeft}>
            <View style={styles.iconBadge}>
              <Text style={styles.iconEmoji}>💼</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работника</Text>
            <Text style={styles.cardSub}>Размещайте вакансии{'\n'}и находите сотрудников</Text>
          </View>

          <View style={styles.arrowBtn}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ══ Карточка 2: Ищу работодателя (тёмная) ══ */}
        <TouchableOpacity
          style={[styles.card, { marginTop: CARD2_MT }]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          <View style={[StyleSheet.absoluteFill, styles.bgDark]} />

          <Image
            source={require('../assets/images/char-worker.png')}
            style={[styles.charImg, { width: WORK_W, height: WORK_H }]}
            resizeMode="contain"
          />

          <View style={styles.cardLeft}>
            <View style={styles.iconBadge}>
              <Text style={styles.iconEmoji}>👤</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работодателя</Text>
            <Text style={styles.cardSub}>Находите подработки{'\n'}на складах</Text>
          </View>

          <View style={styles.arrowBtn}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ── Преимущества ── */}
        <View style={styles.featuresRow}>
          {[
            { icon: '🛡️', title: 'Безопасно', sub: 'Проверенные\nкомпании' },
            { icon: '⚡', title: 'Быстро', sub: 'Отклики и подбор\nза 1 день' },
            { icon: '⭐', title: 'Надёжно', sub: 'Поддержка\n24/7' },
          ].map((f) => (
            <View key={f.title} style={styles.feature}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureSub}>{f.sub}</Text>
            </View>
          ))}
        </View>

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
    paddingHorizontal: r(20),
    paddingTop: r(10),
    paddingBottom: r(12),
    maxWidth: 430,
    width: '100%',
    alignSelf: 'center',
  },

  logoRow: { marginBottom: r(16) },
  logo: { fontSize: r(34) },
  logoBlack: { fontWeight: '800', color: '#111111' },
  logoOrange: { fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: r(13), color: Colors.textSecondary, marginTop: r(4) },

  headlineBlock: { marginBottom: r(6) },
  headline: {
    fontSize: r(38), fontWeight: '800', color: '#111111', lineHeight: r(44),
  },
  headlineSub: {
    fontSize: r(14), color: Colors.textSecondary,
    marginTop: r(8), lineHeight: r(20),
  },

  card: {
    height: CARD_H,
    overflow: 'visible',
  },

  bgOrange: { backgroundColor: Colors.primary, borderRadius: r(20), overflow: 'hidden' },
  bgDark:   { backgroundColor: '#1E1E1E',       borderRadius: r(20), overflow: 'hidden' },

  charImg: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },

  cardLeft: {
    position: 'absolute',
    left: r(18),
    top: r(16),
    bottom: r(18),
    right: r(190),
  },

  // Оранжевый бейдж — одинаковый на обеих карточках (как в референсе)
  iconBadge: {
    width: r(40), height: r(40), borderRadius: r(20),
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: r(10),
  },
  iconEmoji: { fontSize: r(18) },

  cardTitle: {
    fontSize: r(22), fontWeight: '800', color: '#FFFFFF',
    lineHeight: r(27), marginBottom: r(5),
  },
  cardSub: {
    fontSize: r(13), color: 'rgba(255,255,255,0.78)', lineHeight: r(18),
  },

  arrowBtn: {
    position: 'absolute',
    right: r(20),
    top: CARD_H / 2 - r(21),
    width: r(42), height: r(42), borderRadius: r(21),
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  arrowTxt: { fontSize: r(24), color: '#111111', lineHeight: r(28), marginLeft: 2 },

  featuresRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: r(14), marginBottom: r(10),
  },
  feature: { flex: 1, alignItems: 'center', paddingHorizontal: r(4) },
  featureIcon: { fontSize: r(20), marginBottom: r(3) },
  featureTitle: { fontSize: r(12), fontWeight: '700', color: '#111111', marginBottom: r(2) },
  featureSub: { fontSize: r(10), color: Colors.textSecondary, textAlign: 'center', lineHeight: r(14) },

  loginCard: {
    backgroundColor: '#FFFFFF', borderRadius: r(14),
    paddingVertical: r(13),
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: r(10),
  },
  loginGray: { fontSize: r(13), color: Colors.textSecondary },
  loginLink: { fontSize: r(13), fontWeight: '700', color: Colors.primary },

  version: { textAlign: 'center', fontSize: r(10), color: Colors.textMuted },
});
