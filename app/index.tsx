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
const { width: SW } = Dimensions.get('window');
const SC = SW / 375; // масштаб относительно базового iPhone 375px

// Карточки
const CARD_H  = Math.round(158 * SC);
// Персонаж работодателя (char-employer.png 1024×1536)
const EMPL_W  = Math.round(220 * SC);
const EMPL_H  = Math.round(330 * SC);
// Персонаж соискателя (char-worker.png 1112×2400)
const WORK_W  = Math.round(170 * SC);
const WORK_H  = Math.round(367 * SC);
// Отступ перед второй карточкой: overflow персонажа + зазор
const CARD2_MT = Math.round(60 * SC);

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
        {/* Лого */}
        <View style={styles.logoRow}>
          <Text style={styles.logo}>
            <Text style={styles.logoBlack}>Job</Text>
            <Text style={styles.logoOrange}>Too</Text>
          </Text>
          <Text style={styles.tagline}>Подработки в Москве · Склад</Text>
        </View>

        {/* Заголовок */}
        <View style={styles.headlineBlock}>
          <Text style={styles.headline}>{'Выберите,\nкто вы'}</Text>
          <Text style={styles.headlineSub}>{'Мы адаптируем приложение\nпод ваши задачи'}</Text>
        </View>

        {/* ─── Карточка: Ищу работника (оранжевая) ─── */}
        <TouchableOpacity
          style={[styles.card, styles.cardOrange]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-employer')}
        >
          {/* Фон с border-radius — отдельный слой для совместимости с Android */}
          <View style={[StyleSheet.absoluteFill, styles.cardBg, styles.cardOrangeBg]} />

          {/* Персонаж: прозрачный PNG, ноги у нижнего края, голова торчит выше */}
          <Image
            source={require('../assets/images/char-employer.png')}
            style={[styles.charImg, { width: EMPL_W, height: EMPL_H }]}
            resizeMode="contain"
          />

          {/* Текст слева */}
          <View style={styles.cardText}>
            <View style={styles.cardIconCircle}>
              <Text style={styles.cardIconTxt}>💼</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работника</Text>
            <Text style={styles.cardSub}>Размещайте вакансии{'\n'}и находите сотрудников</Text>
          </View>

          {/* Стрелка */}
          <View style={styles.arrowBtn}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ─── Карточка: Ищу работодателя (тёмная) ─── */}
        <TouchableOpacity
          style={[styles.card, styles.cardDark, { marginTop: CARD2_MT }]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          <View style={[StyleSheet.absoluteFill, styles.cardBg, styles.cardDarkBg]} />

          <Image
            source={require('../assets/images/char-worker.png')}
            style={[styles.charImg, { width: WORK_W, height: WORK_H }]}
            resizeMode="contain"
          />

          <View style={styles.cardText}>
            <View style={[styles.cardIconCircle, styles.cardIconCircleDark]}>
              <Text style={styles.cardIconTxt}>👤</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работодателя</Text>
            <Text style={styles.cardSub}>Находите подработки{'\n'}на складах</Text>
          </View>

          <View style={styles.arrowBtn}>
            <Text style={styles.arrowTxt}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Преимущества */}
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

        {/* Вход */}
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

  scroll: { paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },

  logoRow: { marginBottom: Math.round(28 * SC) },
  logo: { fontSize: Math.round(36 * SC) },
  logoBlack: { fontWeight: '800', color: '#111111' },
  logoOrange: { fontWeight: '800', color: Colors.primary },
  tagline: { fontSize: Math.round(14 * SC), color: Colors.textSecondary, marginTop: 4 },

  headlineBlock: { marginBottom: Math.round(10 * SC) },
  headline: {
    fontSize: Math.round(40 * SC),
    fontWeight: '800',
    color: '#111111',
    lineHeight: Math.round(46 * SC),
  },
  headlineSub: {
    fontSize: Math.round(15 * SC),
    color: Colors.textSecondary,
    marginTop: Math.round(10 * SC),
    lineHeight: Math.round(22 * SC),
  },

  // Карточка — фиксированная высота, overflow visible чтобы персонаж торчал выше
  card: {
    height: CARD_H,
    overflow: 'visible',
    marginBottom: 0,
  },

  // Фон карточки — отдельный слой с overflow hidden для корректного border-radius
  cardBg: {
    borderRadius: Math.round(20 * SC),
    overflow: 'hidden',
  },
  cardOrangeBg: { backgroundColor: Colors.primary },
  cardDarkBg:   { backgroundColor: '#1E1E1E' },

  // Совместимость с TouchableOpacity (цвет не нужен — задаём через cardBg)
  cardOrange: {},
  cardDark:   {},

  // Персонаж — прозрачный PNG, ноги у нижнего края карточки, голова вылезает выше
  charImg: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },

  // Текст — левая часть карточки
  cardText: {
    position: 'absolute',
    left: Math.round(20 * SC),
    top: Math.round(16 * SC),
    bottom: Math.round(20 * SC),
    right: Math.round(175 * SC),
  },
  cardIconCircle: {
    width: Math.round(38 * SC),
    height: Math.round(38 * SC),
    borderRadius: Math.round(19 * SC),
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Math.round(10 * SC),
  },
  cardIconCircleDark: { backgroundColor: 'rgba(255,107,26,0.25)' },
  cardIconTxt: { fontSize: Math.round(18 * SC) },
  cardTitle: {
    fontSize: Math.round(22 * SC),
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: Math.round(26 * SC),
    marginBottom: Math.round(6 * SC),
  },
  cardSub: {
    fontSize: Math.round(13 * SC),
    color: 'rgba(255,255,255,0.75)',
    lineHeight: Math.round(18 * SC),
  },

  // Стрелка — правый нижний угол карточки
  arrowBtn: {
    position: 'absolute',
    right: Math.round(20 * SC),
    bottom: Math.round(20 * SC),
    width: Math.round(42 * SC),
    height: Math.round(42 * SC),
    borderRadius: Math.round(21 * SC),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  arrowTxt: {
    fontSize: Math.round(24 * SC),
    color: '#111111',
    lineHeight: Math.round(28 * SC),
    marginLeft: 2,
  },

  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Math.round(22 * SC),
    marginBottom: Math.round(16 * SC),
  },
  feature: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  featureIcon: { fontSize: Math.round(22 * SC), marginBottom: 4 },
  featureTitle: {
    fontSize: Math.round(13 * SC),
    fontWeight: '700',
    color: '#111111',
    marginBottom: 3,
  },
  featureSub: {
    fontSize: Math.round(11 * SC),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Math.round(15 * SC),
  },

  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Math.round(16 * SC),
    paddingVertical: Math.round(16 * SC),
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Math.round(16 * SC),
  },
  loginGray: { fontSize: Math.round(14 * SC), color: Colors.textSecondary },
  loginLink: { fontSize: Math.round(14 * SC), fontWeight: '700', color: Colors.primary },

  version: { textAlign: 'center', fontSize: Math.round(11 * SC), color: Colors.textMuted },
});
