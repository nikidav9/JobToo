import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';

const TRACK_W = 140;

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
      >
        {/* Logo + tagline */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <Text style={styles.tagline}>Подработки в Москве · Склад</Text>
        </View>

        {/* Headline */}
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>{'Выберите,\nкто вы'}</Text>
          <Text style={styles.headlineSub}>{'Мы адаптируем приложение\nпод ваши задачи'}</Text>
        </View>

        {/* Card — Employer (orange) */}
        <TouchableOpacity
          style={[styles.card, styles.cardOrange]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-employer')}
        >
          <View style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <View style={styles.cardIconCircle}>
                <Text style={styles.cardIcon}>💼</Text>
              </View>
              <Text style={styles.cardTitle}>Ищу{'\n'}работника</Text>
              <Text style={styles.cardSub}>Размещайте вакансии{'\n'}и находите сотрудников</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardEmoji}>👷</Text>
              <View style={styles.arrowBtn}>
                <Text style={styles.arrowTxt}>›</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Card — Worker (dark) */}
        <TouchableOpacity
          style={[styles.card, styles.cardDark]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          <View style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <View style={[styles.cardIconCircle, styles.cardIconCircleDark]}>
                <Text style={styles.cardIcon}>👤</Text>
              </View>
              <Text style={styles.cardTitle}>Ищу{'\n'}работодателя</Text>
              <Text style={styles.cardSub}>Находите подработки{'\n'}на складах</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={styles.cardEmoji}>🧑‍💻</Text>
              <View style={styles.arrowBtn}>
                <Text style={styles.arrowTxt}>›</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Features row */}
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

        {/* Login row */}
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

  // Splash
  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashLogo: { fontSize: 44 },
  track: {
    width: TRACK_W, height: 3,
    backgroundColor: Colors.inputBorder,
    borderRadius: 100, overflow: 'hidden', marginTop: 28,
  },
  fill: { height: 3, backgroundColor: Colors.primary, borderRadius: 100 },

  // Scroll
  scroll: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12 },

  // Logo
  logoRow: { marginBottom: 28 },
  logo: { fontSize: 36 },
  logoBlack: { fontWeight: '800', color: '#111111' },
  logoOrange: { fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  // Headline
  headlineBlock: { marginBottom: 28 },
  headline: { fontSize: 40, fontWeight: '800', color: '#111111', lineHeight: 46 },
  headlineSub: { fontSize: 15, color: Colors.textSecondary, marginTop: 10, lineHeight: 22 },

  // Cards
  card: {
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
    minHeight: 160,
  },
  cardOrange: { backgroundColor: Colors.primary },
  cardDark: { backgroundColor: '#1E1E1E' },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 20,
    flex: 1,
    minHeight: 160,
  },
  cardLeft: { flex: 1, justifyContent: 'flex-start' },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  cardIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  cardIconCircleDark: { backgroundColor: 'rgba(255,107,26,0.25)' },
  cardIcon: { fontSize: 18 },
  cardTitle: {
    fontSize: 22, fontWeight: '800', color: '#FFFFFF',
    lineHeight: 26, marginBottom: 8,
  },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },
  cardEmoji: { fontSize: 72, lineHeight: 80 },
  arrowBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowTxt: { fontSize: 22, color: '#111111', lineHeight: 26, marginLeft: 2 },

  // Features
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8, marginBottom: 16,
  },
  feature: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  featureIcon: { fontSize: 22, marginBottom: 4 },
  featureTitle: { fontSize: 13, fontWeight: '700', color: '#111111', marginBottom: 3 },
  featureSub: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', lineHeight: 15 },

  // Login
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loginGray: { fontSize: 14, color: Colors.textSecondary },
  loginLink: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  version: { textAlign: 'center', fontSize: 11, color: Colors.textMuted },
});
