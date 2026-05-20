import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';

const TRACK_W = 140;
const CARD_H = 158;   // visible card height
const CHAR_H = 240;   // character image height (overflows above card)
const OVERFLOW = CHAR_H - CARD_H; // 82px peeking above card

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
        <View style={styles.logoRow}>
          <Text style={styles.logo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <Text style={styles.tagline}>Подработки в Москве · Склад</Text>
        </View>

        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>{'Выберите,\nкто вы'}</Text>
          <Text style={styles.headlineSub}>{'Мы адаптируем приложение\nпод ваши задачи'}</Text>
        </View>

        {/* Card — Ищу работника (orange) */}
        {/* Wrapper height = CHAR_H so character overflow is inside the wrapper */}
        <TouchableOpacity
          style={styles.cardWrapper}
          activeOpacity={0.9}
          onPress={() => router.push('/register-employer')}
        >
          {/* Colored background — only bottom CARD_H portion */}
          <View style={[styles.cardBg, { backgroundColor: Colors.primary }]} />

          {/* Character — full CHAR_H, right side */}
          <Image
            source={require('../assets/images/char-employer.png')}
            style={styles.cardChar}
            resizeMode="contain"
          />

          {/* Text — inside card zone */}
          <View style={styles.cardText}>
            <View style={styles.cardIconCircle}>
              <Text style={styles.cardIcon}>💼</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работника</Text>
            <Text style={styles.cardSub}>Размещайте вакансии{'\n'}и находите сотрудников</Text>
          </View>

          <View style={styles.arrowBtn}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Card — Ищу работодателя (dark) */}
        <TouchableOpacity
          style={[styles.cardWrapper, { marginTop: 14 }]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          <View style={[styles.cardBg, { backgroundColor: '#1E1E1E' }]} />

          <Image
            source={require('../assets/images/char-worker.jpeg')}
            style={styles.cardChar}
            resizeMode="contain"
          />

          <View style={styles.cardText}>
            <View style={[styles.cardIconCircle, styles.cardIconCircleDark]}>
              <Text style={styles.cardIcon}>👤</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работодателя</Text>
            <Text style={styles.cardSub}>Находите подработки{'\n'}на складах</Text>
          </View>

          <View style={styles.arrowBtn}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Features */}
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
    width: TRACK_W, height: 3,
    backgroundColor: Colors.inputBorder,
    borderRadius: 100, overflow: 'hidden', marginTop: 28,
  },
  fill: { height: 3, backgroundColor: Colors.primary, borderRadius: 100 },

  scroll: { paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12 },

  logoRow: { marginBottom: 28 },
  logo: { fontSize: 36 },
  logoBlack: { fontWeight: '800', color: '#111111' },
  logoOrange: { fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  headlineBlock: { marginBottom: 20 },
  headline: { fontSize: 40, fontWeight: '800', color: '#111111', lineHeight: 46 },
  headlineSub: { fontSize: 15, color: Colors.textSecondary, marginTop: 10, lineHeight: 22 },

  // cardWrapper: full width, height = CHAR_H (character + card combined)
  cardWrapper: {
    height: CHAR_H,
    // no overflow needed — wrapper already sized to contain everything
  },

  // Colored card background — sits at the BOTTOM of the wrapper
  cardBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_H,
    borderRadius: 20,
  },

  // Character image — full wrapper height, anchored to bottom-right
  cardChar: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 185,
    height: CHAR_H,
  },

  // Text block — inside the card zone (bottom CARD_H), left side
  cardText: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    top: OVERFLOW + 16, // starts inside the card zone
    right: 185,
  },

  cardIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  cardIconCircleDark: { backgroundColor: 'rgba(255,107,26,0.25)' },
  cardIcon: { fontSize: 18 },
  cardTitle: {
    fontSize: 24, fontWeight: '800', color: '#FFFFFF',
    lineHeight: 28, marginBottom: 6,
  },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },

  // Arrow button — bottom-right inside card zone
  arrowBtn: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  arrowTxt: { fontSize: 24, color: '#111111', lineHeight: 28, marginLeft: 2 },

  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20, marginBottom: 16,
  },
  feature: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  featureIcon: { fontSize: 22, marginBottom: 4 },
  featureTitle: { fontSize: 13, fontWeight: '700', color: '#111111', marginBottom: 3 },
  featureSub: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', lineHeight: 15 },

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
