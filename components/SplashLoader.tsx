import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LOGO_STROKES } from '@/constants/logoStrokes';

// Загрузочный экран: на фирменном оранжевом фоне белой линией прописывается
// логотип JobToo — буква за буквой, как от руки. Снизу счётчик процентов
// реальной загрузки. На экране одна вещь, поэтому глазу не за что цепляться.
//
// Анимация на штатном RN Animated (не reanimated: babel-плагин в проекте не
// подключён). Линии рисуются через strokeDashoffset, поэтому useNativeDriver
// здесь невозможен — но анимируется всего одно значение, это дёшево.

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: SW } = Dimensions.get('window');
// Логотип занимает ~72% ширины экрана, но не больше 320 px
const ART_W = Math.min(SW * 0.72, 320);
const ART_H = ART_W * 0.4; // viewBox 300×120

const WHITE = '#FFFFFF';
const ORANGE = '#FF6B1A';

// Длительность полной прорисовки
const DRAW_MS = 2300;

// Штрихи арта. from/to — окно прорисовки внутри общего прогресса 0→1,
// len — приблизительная длина пути (для strokeDasharray).
export type Stroke = { d: string; len: number; from: number; to: number; w?: number; t?: string };


function DrawnStroke({ stroke, progress, color = WHITE, scale = 1 }: {
  stroke: Stroke; progress: Animated.Value; color?: string; scale?: number;
}) {
  const offset = progress.interpolate({
    inputRange: [stroke.from, stroke.to],
    outputRange: [stroke.len, 0],
    extrapolate: 'clamp',
  });
  return (
    <AnimatedPath
      d={stroke.d}
      transform={stroke.t}
      stroke={color}
      strokeWidth={(stroke.w ?? 3.4) * scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      strokeDasharray={[stroke.len, stroke.len]}
      strokeDashoffset={offset as unknown as number}
    />
  );
}

/**
 * Переиспользуемый «рисующийся» арт: линии прорисовываются по своим окнам
 * внутри общего прогресса. Используется и на загрузочном экране, и в
 * иконках выбора роли, чтобы стиль везде был один.
 */
export function DrawnArt({
  strokes, viewBox, width, height, color = WHITE, delay = 0, duration = DRAW_MS, strokeScale = 1,
}: {
  strokes: Stroke[];
  viewBox: string;
  width: number;
  height: number;
  color?: string;
  delay?: number;
  duration?: number;
  strokeScale?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1, duration, delay,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, []);

  return (
    <Svg width={width} height={height} viewBox={viewBox}>
      {strokes.map((s, i) => (
        <DrawnStroke key={i} stroke={s} progress={progress} color={color} scale={strokeScale} />
      ))}
    </Svg>
  );
}

/**
 * Процент загрузки. Три фазы, чтобы счёт выглядел живым и честным:
 *   1) 1 → 95 % равномерно за minMs, пока прописывается логотип;
 *   2) 95 → 99 % по одному проценту раз в TAIL_STEP_MS, если данные ещё едут
 *      (видно, что приложение не зависло, но и до 100 % не врём);
 *   3) данные готовы → быстро добегаем до 100 %.
 */
const TAIL_STEP_MS = 700;

// Момент начала загрузки, общий на всё приложение. Загрузочный экран
// показывается дважды подряд (сначала в index.tsx, затем оверлеем
// EntryTransition при входе во вкладки) — без общего старта прорисовка и
// счётчик сбрасывались бы на второй раз. Держим их непрерывными.
let bootStartedAt: number | null = null;
function bootStart(): number {
  if (bootStartedAt == null) bootStartedAt = Date.now();
  return bootStartedAt;
}

/** Сколько миллисекунд прошло с начала загрузки приложения. */
export function bootElapsed(): number {
  return Date.now() - bootStart();
}

/**
 * Минимальное время показа загрузочного экрана: полная прорисовка логотипа
 * плюс небольшой запас, чтобы счётчик успел добежать до 100 %. Без него при
 * быстром старте (например, у гостя, которому нечего грузить) экран улетал
 * недорисованным.
 */
export const SPLASH_MIN_MS = DRAW_MS + 280;

export function useLoadingPercent(ready: boolean, minMs = DRAW_MS): number {
  const [percent, setPercent] = useState(1);
  const start = useRef(bootStart());
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

  useEffect(() => {
    // Продолжаем с того места, где остановился предыдущий показ, а не с нуля
    const elapsed = Date.now() - bootStart();
    const done = Math.min(1, elapsed / DRAW_MS);
    progress.setValue(done);
    if (done < 1) {
      Animated.timing(progress, {
        toValue: 1,
        duration: DRAW_MS * (1 - done),
        easing: Easing.linear,
        useNativeDriver: false, // strokeDashoffset — не нативное свойство
      }).start();
    }

  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.artWrap}>
        <Svg width={ART_W} height={ART_H} viewBox="0 0 300 120">
          {LOGO_STROKES.map((s, i) => (
            <DrawnStroke key={i} stroke={s} progress={progress} />
          ))}
        </Svg>
      </View>

      {/* Счётчик виден с первого кадра — отсчёт начинается с единицы */}
      <View style={styles.bottom}>
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
  bottom: { alignItems: 'center', marginTop: 22 },
  percent: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '700',
    fontStyle: 'italic',      // намёк на рукописный счётчик из референса
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.85)',
  },
});
