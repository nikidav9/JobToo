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
  // ── Корзина ──
  // ручка
  { d: 'M 68 148 Q 70 100 100 98 Q 130 100 132 148', len: 136, from: 0.00, to: 0.12 },
  // верхний край (обод)
  { d: 'M 28 150 Q 100 137 172 150', len: 150, from: 0.08, to: 0.20 },
  { d: 'M 28 150 Q 100 163 172 150', len: 150, from: 0.14, to: 0.25 },
  // корпус
  { d: 'M 34 153 L 55 231 Q 57 240 67 240 L 133 240 Q 143 240 145 231 L 166 153', len: 264, from: 0.18, to: 0.42 },
  // плетение — вертикали
  { d: 'M 60 160 L 70 236', len: 78, from: 0.36, to: 0.45, w: 2.6 },
  { d: 'M 86 158 L 90 239', len: 82, from: 0.39, to: 0.48, w: 2.6 },
  { d: 'M 114 158 L 110 239', len: 82, from: 0.42, to: 0.51, w: 2.6 },
  { d: 'M 140 160 L 130 236', len: 78, from: 0.45, to: 0.54, w: 2.6 },
  // плетение — горизонталь
  { d: 'M 44 196 Q 100 205 156 196', len: 116, from: 0.50, to: 0.59, w: 2.6 },

  // ── Продукты, вылетающие вверх ──
  // яблоко (центр) — круг рисуется одной дугой, поэтому выглядит ровным
  { d: 'M 100 40 A 18 18 0 1 1 99.99 40', len: 114, from: 0.56, to: 0.69 },
  { d: 'M 100 41 L 103 28', len: 14, from: 0.67, to: 0.72, w: 2.8 },
  { d: 'M 103 32 Q 115 26 117 36 Q 107 40 103 32 Z', len: 34, from: 0.70, to: 0.76, w: 2.8 },
  // бутылка (слева, с наклоном — будто в полёте)
  { d: 'M 38 108 L 36 84 Q 35 77 40 74 L 40 64 L 54 64 L 54 74 Q 59 77 58 84 L 56 108 Q 47 112 38 108 Z', len: 138, from: 0.62, to: 0.77, t: 'rotate(-16 46 88)' },
  { d: 'M 40 70 L 54 70', len: 15, from: 0.75, to: 0.79, w: 2.8, t: 'rotate(-16 46 88)' },
  // булка (справа, с наклоном)
  { d: 'M 136 94 Q 134 76 154 74 Q 174 76 172 94 Q 170 104 154 104 Q 138 104 136 94 Z', len: 116, from: 0.68, to: 0.82, t: 'rotate(14 154 86)' },
  { d: 'M 145 83 L 151 89', len: 9, from: 0.80, to: 0.85, w: 2.6, t: 'rotate(14 154 86)' },
  { d: 'M 156 81 L 162 87', len: 9, from: 0.82, to: 0.87, w: 2.6, t: 'rotate(14 154 86)' },

  // ── Искры движения ──
  { d: 'M 22 116 L 12 106', len: 15, from: 0.84, to: 0.90, w: 2.6 },
  { d: 'M 178 114 L 188 104', len: 15, from: 0.87, to: 0.93, w: 2.6 },
  { d: 'M 100 18 L 100 8', len: 11, from: 0.90, to: 0.96, w: 2.6 },
  { d: 'M 58 40 L 51 32', len: 11, from: 0.92, to: 0.98, w: 2.6 },
  { d: 'M 146 38 L 154 30', len: 11, from: 0.94, to: 1.00, w: 2.6 },
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
 * Процент загрузки: плавно ползёт до 95 % за minMs, а когда данные готовы —
 * добегает до 100 %. Так счётчик отражает реальную загрузку, а не таймер.
 */
export function useLoadingPercent(ready: boolean, minMs = DRAW_MS): number {
  const [percent, setPercent] = useState(0);
  const start = useRef(Date.now());
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const id = setInterval(() => {
      setPercent(prev => {
        if (readyRef.current) return Math.min(100, prev + 7);
        const t = Math.min(1, (Date.now() - start.current) / minMs);
        // ease-out: в начале быстро, ближе к 95 % замедляется
        const eased = 1 - Math.pow(1 - t, 2.2);
        return Math.max(prev, Math.round(eased * 95));
      });
    }, 45);
    return () => clearInterval(id);
  }, [minMs]);

  return percent;
}

export default function SplashLoader({ percent = 0 }: { percent?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DRAW_MS,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset — не нативное свойство
    }).start();
    // Логотип и счётчик проявляются, когда корзина уже нарисована
    Animated.timing(fade, {
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

      <Animated.View style={[styles.bottom, { opacity: fade }]}>
        <Text style={styles.logo}>JobToo</Text>
        <Text style={styles.percent}>{Math.round(percent)}%</Text>
      </Animated.View>
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
