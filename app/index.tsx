import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { Colors } from '@/constants/theme';

const TRACK_W = 140;
const CARD_H = 158;

// char-employer.png: 1024×1536 (ratio 0.667), character at bottom 60%
// Display size so character peeks 40px above card: H=330, W=220
// char-worker.png: 1112×2400 (ratio 0.463), character at bottom 55%
// Display size so character peeks 44px above card: H=367, W=170

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

        {/* ─── Карточка: Ищу работника (оранжевая) ─── */}
        <TouchableOpacity
          style={[styles.card, styles.cardOrange]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-employer')}
        >
          {/* Персонаж — торчит 40px выше карточки */}
          <Image
            source={require('../assets/images/char-employer.png')}
            style={styles.charEmployer}
            resizeMode="contain"
          />
          {/* Текст слева */}
          <View style={styles.cardText}>
            <View style={styles.cardIconCircle}>
              <Text style={styles.cardIcon}>💼</Text>
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
        {/* marginTop = 44px (overflow чела) + 16px (отступ) = 60 */}
        <TouchableOpacity
          style={[styles.card, styles.cardDark, { marginTop: 60 }]}
          activeOpacity={0.9}
          onPress={() => router.push('/register-worker')}
        >
          {/* Персонаж */}
          <Image
            source={require('../assets/images/char-worker.png')}
            style={styles.charWorker}
            resizeMode="contain"
          />
          {/* Текст слева */}
          <View style={styles.cardText}>
            <View style={[styles.cardIconCircle, styles.cardIconCircleDark]}>
              <Text style={styles.cardIcon}>👤</Text>
            </View>
            <Text style={styles.cardTitle}>Ищу{'\n'}работодателя</Text>
            <Text style={styles.cardSub}>Находите подработки{'\n'}на складах</Text>
          </View>
          {/* Стрелка */}
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

  headlineBlock: { marginBottom: 10 },
  headline: { fontSize: 40, fontWeight: '800', color: '#111111', lineHeight: 46 },
  headlineSub: { fontSize: 15, color: Colors.textSecondary, marginTop: 10, lineHeight: 22 },

  // Карточка: height фиксированный, overflow visible — чтобы персонаж торчал выше
  card: {
    height: CARD_H,
    borderRadius: 20,
    overflow: 'visible',
  },
  cardOrange: { backgroundColor: Colors.primary },
  cardDark: { backgroundColor: '#1E1E1E' },

  // Персонаж оранжевой карточки (1024×1536 → 220×330)
  // bottom:0 = ноги у нижнего края карточки
  // 330 - 158 = 172px выше нижнего края, из них 330*0.40=132px — прозрачное небо
  // персонаж начинается с 330*0.40=132px сверху изображения = на 172-132=40px ВЫШЕ карточки
  charEmployer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 220,
    height: 330,
  },

  // Персонаж тёмной карточки (1112×2400 → 170×367)
  // персонаж начинается с 367*0.45=165px = на 367-158-165=44px ВЫШЕ карточки
  charWorker: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 170,
    height: 367,
  },

  // Текст — левая половина карточки, не перекрывает персонажа
  cardText: {
    position: 'absolute',
    left: 20,
    top: 16,
    bottom: 20,
    right: 175,
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
    fontSize: 22, fontWeight: '800', color: '#FFFFFF',
    lineHeight: 26, marginBottom: 6,
  },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },

  arrowBtn: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  arrowTxt: { fontSize: 24, color: '#111111', lineHeight: 28, marginLeft: 2 },

  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 16,
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
