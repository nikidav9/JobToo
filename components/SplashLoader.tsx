import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  BASKET_STROKES, SPARK_STROKES, PRODUCTS, ART_VB_W, ART_VB_H,
  BASKET_DRAW_MS, PROD_FIRST_MS, PROD_STAGGER_MS, PROD_FALL_MS,
  SPARKS_AT_MS, SPARKS_MS,
} from '@/constants/basketArt';

// Загрузочный экран: на фирменном оранжевом линией рисуется корзина, затем над
// ней один за другим плавно опускаются продукты и разлетаются искорки. Снизу —
// название и счётчик процентов реальной загрузки.
//
// Анимация на штатном RN Animated (не reanimated: babel-плагин в проекте не
// подключён). Линии рисуются через strokeDashoffset, поэтому useNativeDriver
// здесь невозможен — но анимируется всего одно значение, это дёшево.

const AnimatedPath = Animated.createAnimatedComponent(Path);

const { width: SW, height: SH } = Dimensions.get('window');
// Арт занимает ~62 % ширины, но не вылезает по высоте на маленьких экранах
const ART_W = Math.min(SW * 0.62, SH * 0.30);
const ART_H = ART_W * (ART_VB_H / ART_VB_W);
const K = ART_W / ART_VB_W; // из координат арта в пиксели

const WHITE = '#FFFFFF';
const ORANGE = '#FF6B1A';

// Длительность полной прорисовки
const DRAW_MS = 1280;

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
const TAIL_STEP_MS = 250;

// Момент начала загрузки, общий на всё приложение. Загрузочный экран
// показывается дважды подряд (сначала в index.tsx, затем оверлеем
// EntryTransition при входе во вкладки) — без общего старта прорисовка и
// счётчик сбрасывались бы на второй раз. Держим их непрерывными.
// Достигнутый процент — общий для обоих показов экрана. Без него второй
// показ (оверлей поверх вкладок) начинал считать заново и откатывал 100 → 99.
let lastPercent = 1;
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
export const SPLASH_MIN_MS = DRAW_MS + 280;  // ≈1.56 c: хватает и на добег 95→100

export function useLoadingPercent(ready: boolean, minMs = DRAW_MS): number {
  const [percent, setPercent] = useState(lastPercent);
  const start = useRef(bootStart());
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const id = setInterval(() => {
      setPercent(prevState => {
        // Считаем от общего достигнутого значения, а не от локального
        const prev = Math.max(prevState, lastPercent);
        if (prev >= 100) { lastPercent = 100; return 100; }
        if (readyRef.current) {
          // Добегаем до 100 плавно: у финиша — по проценту за тик, чтобы
          // 96, 97, 98, 99 успели показаться, а не перескочили одним кадром
          const left = 100 - prev;
          return (lastPercent = Math.min(100, prev + (left > 12 ? Math.ceil(left / 8) : 1)));
        }
        const elapsed = Date.now() - start.current;
        if (elapsed < minMs) {
          // равномерный подъём 1 → 95: пользователь видит счёт с самого начала
          return (lastPercent = Math.max(prev, Math.round(1 + (elapsed / minMs) * 94)));
        }
        // хвост: 96, 97, 98, 99 — заметно медленнее
        const extra = Math.floor((elapsed - minMs) / TAIL_STEP_MS);
        return (lastPercent = Math.max(prev, Math.min(99, 95 + extra)));
      });
    }, 45);
    return () => clearInterval(id);
  }, [minMs]);

  return percent;
}

/** Один товар: опускается сверху в корзину и проявляется. */
function FallingProduct({ p, index }: { p: typeof PRODUCTS[number]; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const at = PROD_FIRST_MS + index * PROD_STAGGER_MS;
    const elapsed = bootElapsed();
    if (elapsed >= at + PROD_FALL_MS) { anim.setValue(1); return; }
    Animated.timing(anim, {
      toValue: 1,
      duration: PROD_FALL_MS,
      delay: Math.max(0, at - elapsed),
      easing: Easing.out(Easing.cubic), // мягко замедляется, будто кладут
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: p.left * K,
        top: p.top * K,
        width: p.w * K,
        height: p.h * K,
        opacity: anim,
        transform: [{
          translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-46 * K, 0] }),
        }],
      }}
    >
      <Svg width={p.w * K} height={p.h * K} viewBox={`0 0 ${p.w} ${p.h}`}>
        {p.paths.map((path, i) => (
          <Path
            key={i}
            d={path.d}
            transform={path.t}
            stroke={WHITE}
            strokeWidth={path.w ?? 3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

export default function SplashLoader({ percent = 1 }: { percent?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const sparks = useRef(new Animated.Value(0)).current;
  const nameFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Продолжаем с того места, где остановился предыдущий показ, а не с нуля
    const elapsed = bootElapsed();

    const done = Math.min(1, elapsed / BASKET_DRAW_MS);
    progress.setValue(done);
    if (done < 1) {
      Animated.timing(progress, {
        toValue: 1,
        duration: BASKET_DRAW_MS * (1 - done),
        easing: Easing.linear,
        useNativeDriver: false, // strokeDashoffset — не нативное свойство
      }).start();
    }

    // Искорки — после того, как продукты легли
    const sDone = Math.min(1, Math.max(0, (elapsed - SPARKS_AT_MS) / SPARKS_MS));
    sparks.setValue(sDone);
    if (sDone < 1) {
      Animated.timing(sparks, {
        toValue: 1,
        duration: SPARKS_MS * (1 - sDone),
        delay: Math.max(0, SPARKS_AT_MS - elapsed),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    }

    // Название проявляется, когда корзина уже нарисована
    const nameAt = BASKET_DRAW_MS + 120;
    if (elapsed >= nameAt + 450) {
      nameFade.setValue(1);
    } else {
      Animated.timing(nameFade, {
        toValue: 1,
        duration: 450,
        delay: Math.max(0, nameAt - elapsed),
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, []);

  return (
    <View style={styles.root}>
      <View style={[styles.artWrap, { width: ART_W, height: ART_H }]}>
        {/* товары рисуем первыми — корзина ложится поверх и «прячет» их низ */}
        {PRODUCTS.map((p, i) => (
          <FallingProduct key={i} p={p} index={i} />
        ))}
        <Svg
          width={ART_W}
          height={ART_H}
          viewBox={`0 0 ${ART_VB_W} ${ART_VB_H}`}
          style={StyleSheet.absoluteFill}
        >
          {BASKET_STROKES.map((s, i) => (
            <DrawnStroke key={i} stroke={s} progress={progress} />
          ))}
          {SPARK_STROKES.map((s, i) => (
            <DrawnStroke key={`sp${i}`} stroke={s} progress={sparks} />
          ))}
        </Svg>
      </View>

      <View style={styles.bottom}>
        <Animated.Text style={[styles.name, { opacity: nameFade }]}>JobToo</Animated.Text>
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
  artWrap: { position: 'relative' },
  bottom: { alignItems: 'center', marginTop: 24 },
  name: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, color: WHITE },
  percent: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '700',
    fontStyle: 'italic',      // намёк на рукописный счётчик из референса
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.85)',
  },
});
