import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// Загрузочный экран: на фирменном оранжевом фоне белой «нарисованной от руки»
// линией прорисовывается корзина, из неё вверх вылетают продукты — как будто
// кладовщик собирает заказ. Снизу счётчик процентов реальной загрузки.
//
// Анимация на штатном RN Animated (не reanimated: babel-плагин в проекте не
// подключён). Линии рисуются через strokeDashoffset, поэтому useNativeDriver
// здесь невозможен — но анимируется всего одно значение, это дёшево.

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: SW, height: SH } = Dimensions.get('window');
// Арт занимает ~62% ширины, но не вылезает по высоте на маленьких экранах
const ART_W = Math.min(SW * 0.62, SH * 0.34);
const ART_H = ART_W * 1.25; // viewBox 200×250

const WHITE = '#FFFFFF';
const ORANGE = '#FF6B1A';

// Длительность полной прорисовки
const DRAW_MS = 2300;

// Штрихи арта. from/to — окно прорисовки внутри общего прогресса 0→1,
// len — приблизительная длина пути (для strokeDasharray).
type Stroke = { d: string; len: number; from: number; to: number; w?: number; t?: string };

const STROKES: Stroke[] = [
  // ── Складской стеллаж ──
  { d: 'M 12 24 L 118 24', len: 106, from: 0.00, to: 0.04 },
  { d: 'M 20 24 L 20 190', len: 166, from: 0.03, to: 0.08 },
  { d: 'M 110 24 L 110 190', len: 166, from: 0.05, to: 0.10 },
  { d: 'M 12 78 L 118 78', len: 106, from: 0.09, to: 0.13 },
  { d: 'M 12 134 L 118 134', len: 106, from: 0.12, to: 0.15 },
  { d: 'M 12 190 L 118 190', len: 106, from: 0.14, to: 0.18 },

  // ── Товар на верхней полке ──
  // пакет молока
  { d: 'M 24 77 L 24 50 L 34 40 L 44 50 L 44 77 Z', len: 100, from: 0.18, to: 0.23, w: 2.8 },
  // коробка
  { d: 'M 48 77 L 48 54 L 68 54 L 68 77 Z', len: 86, from: 0.22, to: 0.26, w: 2.8 },
  { d: 'M 48 62 L 68 62', len: 20, from: 0.26, to: 0.28, w: 2.4 },
  // стакан йогурта
  { d: 'M 74 77 L 72 58 L 86 58 L 84 77 Z', len: 66, from: 0.27, to: 0.30, w: 2.8 },
  { d: 'M 71 55 L 87 55', len: 16, from: 0.30, to: 0.32, w: 2.4 },
  // бутылка
  { d: 'M 94 77 L 94 60 Q 94 55 97 53 L 97 47 L 103 47 L 103 53 Q 106 55 106 60 L 106 77 Z', len: 78, from: 0.31, to: 0.35, w: 2.8 },

  // ── Товар на средней полке ──
  // большая коробка с лентой
  { d: 'M 24 133 L 24 108 L 52 108 L 52 133 Z', len: 106, from: 0.34, to: 0.39, w: 2.8 },
  { d: 'M 38 108 L 38 133', len: 25, from: 0.39, to: 0.41, w: 2.4 },
  // две коробки стопкой
  { d: 'M 58 133 L 58 116 L 80 116 L 80 133 Z', len: 78, from: 0.40, to: 0.44, w: 2.8 },
  { d: 'M 62 116 L 62 100 L 78 100 L 78 116', len: 48, from: 0.44, to: 0.47, w: 2.8 },
  // пачка
  { d: 'M 86 133 L 88 108 Q 88 104 92 104 L 104 104 Q 108 104 108 108 L 108 133 Z', len: 92, from: 0.46, to: 0.50, w: 2.8 },

  // ── Товар на нижней полке ──
  // коробка с лентой
  { d: 'M 24 189 L 24 158 L 54 158 L 54 189 Z', len: 122, from: 0.49, to: 0.54, w: 2.8 },
  { d: 'M 39 158 L 39 189', len: 31, from: 0.54, to: 0.56, w: 2.4 },
  // ящик
  { d: 'M 60 189 L 60 164 L 84 164 L 84 189 Z', len: 98, from: 0.55, to: 0.59, w: 2.8 },
  // канистра
  { d: 'M 92 189 L 92 168 Q 92 163 95 161 L 95 155 L 103 155 L 103 161 Q 106 163 106 168 L 106 189 Z', len: 88, from: 0.58, to: 0.62, w: 2.8 },

  // ── Корзина сборщика (перед стеллажом) ──
  // Широкая и неглубокая, с сетчатым плетением — продуктовая корзина,
  // а не ведро: слабый скос стенок + решётка вместо вертикальных рёбер.
  // Без ручки: любая дуга над овальным ободом читается как крышка или
  // содержимое, а открытый верх ещё и лучше сочетается с падающим товаром.
  { d: 'M 118 170 Q 157 162 196 170', len: 80, from: 0.61, to: 0.65 },
  { d: 'M 118 170 Q 157 178 196 170', len: 80, from: 0.64, to: 0.68 },
  { d: 'M 122 174 L 131 219 Q 132 226 139 226 L 175 226 Q 182 226 183 219 L 192 174', len: 148, from: 0.67, to: 0.76 },
  { d: 'M 137 177 L 142 223', len: 46, from: 0.75, to: 0.78, w: 2.4 },
  { d: 'M 157 176 L 157 225', len: 49, from: 0.77, to: 0.80, w: 2.4 },
  { d: 'M 177 177 L 172 223', len: 46, from: 0.79, to: 0.82, w: 2.4 },
  { d: 'M 126 190 Q 157 197 188 190', len: 63, from: 0.81, to: 0.84, w: 2.4 },
  { d: 'M 130 207 Q 157 213 184 207', len: 55, from: 0.83, to: 0.86, w: 2.4 },

  // ── Товар в полёте: с полки в корзину ──
  { d: 'M 116 88 Q 132 82 140 92', len: 30, from: 0.86, to: 0.90, w: 2.4 },
  { d: 'M 128 116 L 126 100 L 146 96 L 148 112 Z', len: 72, from: 0.88, to: 0.93, w: 2.8 },
  { d: 'M 133 122 Q 138 142 145 158', len: 40, from: 0.92, to: 0.96, w: 2.4 },

  // ── Искры движения ──
  { d: 'M 152 90 L 160 84', len: 10, from: 0.95, to: 0.98, w: 2.4 },
  { d: 'M 154 108 L 162 104', len: 9, from: 0.97, to: 1.00, w: 2.4 },
];

function DrawnStroke({ stroke, progress }: { stroke: Stroke; progress: Animated.Value }) {
  const offset = progress.interpolate({
    inputRange: [stroke.from, stroke.to],
    outputRange: [stroke.len, 0],
    extrapolate: 'clamp',
  });
  return (
    <AnimatedPath
      d={stroke.d}
      transform={stroke.t}
      stroke={WHITE}
      strokeWidth={stroke.w ?? 3.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      strokeDasharray={[stroke.len, stroke.len]}
      strokeDashoffset={offset as unknown as number}
    />
  );
}

/**
 * Процент загрузки. Три фазы, чтобы счёт выглядел живым и честным:
 *   1) 1 → 95 % равномерно за minMs, пока рисуется корзина;
 *   2) 95 → 99 % по одному проценту раз в TAIL_STEP_MS, если данные ещё едут
 *      (видно, что приложение не зависло, но и до 100 % не врём);
 *   3) данные готовы → быстро добегаем до 100 %.
 */
const TAIL_STEP_MS = 700;

export function useLoadingPercent(ready: boolean, minMs = DRAW_MS): number {
  const [percent, setPercent] = useState(1);
  const start = useRef(Date.now());
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const id = setInterval(() => {
      setPercent(prev => {
        if (prev >= 100) return prev;
        if (readyRef.current) return Math.min(100, prev + 7);
        const elapsed = Date.now() - start.current;
        if (elapsed < minMs) {
          // равномерный подъём 1 → 95: пользователь видит счёт с самого начала
          return Math.max(prev, Math.round(1 + (elapsed / minMs) * 94));
        }
        // хвост: 96, 97, 98, 99 — заметно медленнее
        const extra = Math.floor((elapsed - minMs) / TAIL_STEP_MS);
        return Math.max(prev, Math.min(99, 95 + extra));
      });
    }, 45);
    return () => clearInterval(id);
  }, [minMs]);

  return percent;
}

export default function SplashLoader({ percent = 1 }: { percent?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const logoFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DRAW_MS,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset — не нативное свойство
    }).start();
    // Логотип проявляется, когда корзина уже нарисована
    Animated.timing(logoFade, {
      toValue: 1,
      duration: 500,
      delay: DRAW_MS * 0.55,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.artWrap}>
        <Svg width={ART_W} height={ART_H} viewBox="0 0 200 250">
          {STROKES.map((s, i) => (
            <DrawnStroke key={i} stroke={s} progress={progress} />
          ))}
        </Svg>
      </View>

      {/* Место под логотип зарезервировано всегда — счётчик не подпрыгивает,
          когда логотип проявляется */}
      <View style={styles.bottom}>
        <Animated.Text style={[styles.logo, { opacity: logoFade }]}>JobToo</Animated.Text>
        {/* Счётчик виден с первого кадра — отсчёт начинается с единицы */}
        <Text style={styles.percent}>{Math.round(percent)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artWrap: { alignItems: 'center', justifyContent: 'center' },
  bottom: { alignItems: 'center', marginTop: 26 },
  logo: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: WHITE,
  },
  percent: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '700',
    fontStyle: 'italic',      // намёк на рукописный счётчик из референса
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.85)',
  },
});
