import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { rs, rf } from '@/constants/scale';

import {
  DRAW_MS, WORD, LETTER_RISE_MS, LETTER_RISE_EM, letterDelay, letterColor,
  WAVE_START_MS, WAVE_PERIOD_MS, WAVE_STAGGER_MS, WAVE_LIFT_EM, WAVE_DIM,
} from '@/constants/splashArt';

// Загрузочный экран: на фирменном оранжевом стоит «JobTo», справа впрыгивает
// коробка и приземляется на место недостающей «o». Снизу — счётчик процентов
// реальной загрузки.
//
// Кадры прыжка лежат в constants/splashArt.ts, оттуда же их берёт статический
// экран в вебе (app/+html.tsx). Раньше это были две рукописные копии одной
// анимации — расходились они ровно до первой правки в одном из файлов.
//
// Анимация на штатном RN Animated (не reanimated: babel-плагин в проекте не
// подключён). Линии рисуются через strokeDashoffset, поэтому useNativeDriver
// здесь невозможен — но анимируется всего одно значение, это дёшево.

const AnimatedPath = Animated.createAnimatedComponent(Path);

const WHITE = '#FFFFFF';
const ORANGE = '#FF6B1A';

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

/**
 * Буква названия.
 *
 * Два движения, и они разной природы. Первое — приход: буква один раз
 * поднимается снизу и проявляется, каждая со своей задержкой. Второе — волна:
 * когда слово собрано, буквы по очереди чуть приподнимаются и снова тускнеют,
 * и так по кругу, пока экран висит.
 *
 * Волна нужна не для красоты. Загрузочный экран без движения через три
 * секунды читается как зависший, и человек начинает жать кнопки. Достаточно
 * едва заметного дыхания, чтобы этого не происходило.
 */
function WordLetter({ ch, index, progress, wave, size }: {
  ch: string; index: number; progress: Animated.Value; wave: Animated.Value; size: number;
}) {
  const from = letterDelay(index) / DRAW_MS;
  const to = (letterDelay(index) + LETTER_RISE_MS) / DRAW_MS;
  const приход = { inputRange: [from, to], extrapolate: 'clamp' as const };

  // Волна идёт по слову, но сдвиг по фазе живёт не здесь: у каждой буквы своё
  // значение анимации со своей задержкой запуска (см. ниже). Здесь только
  // форма — куда буква уходит в середине цикла.
  const волна = (outputRange: number[]) => wave.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange,
  });

  return (
    <Animated.Text
      style={[
        styles.letter,
        { fontSize: size, color: letterColor(index) },
        {
          opacity: Animated.multiply(
            progress.interpolate({ ...приход, outputRange: [0, 1] }),
            волна([WAVE_DIM, 1, WAVE_DIM]),
          ),
          transform: [{
            translateY: Animated.add(
              progress.interpolate({ ...приход, outputRange: [size * LETTER_RISE_EM, 0] }),
              волна([0, -size * WAVE_LIFT_EM, 0]),
            ),
          }],
        },
      ]}
    >
      {ch}
    </Animated.Text>
  );
}

export default function SplashLoader({ percent = 1 }: { percent?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const waves = useRef(WORD.split('').map(() => new Animated.Value(0))).current;

  const FONT = rf(40);

  useEffect(() => {
    // Продолжаем с того места, где остановился предыдущий показ, а не с нуля:
    // экран показывается дважды подряд — в index.tsx и оверлеем при входе.
    const elapsed = bootElapsed();
    const done = Math.min(1, elapsed / DRAW_MS);
    progress.setValue(done);
    if (done < 1) {
      Animated.timing(progress, {
        toValue: 1,
        duration: DRAW_MS * (1 - done),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    // Волна: у каждой буквы свой запуск, дальше крутится сама.
    const петли = waves.map((v, i) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: WAVE_PERIOD_MS,
          delay: Math.max(0, WAVE_START_MS + i * WAVE_STAGGER_MS - elapsed),
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ),
    );
    петли.forEach(п => п.start());
    return () => петли.forEach(п => п.stop());
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.word}>
        {WORD.split('').map((ch, i) => (
          <WordLetter key={i} ch={ch} index={i} progress={progress} wave={waves[i]} size={FONT} />
        ))}
      </View>

      {/* Счётчик виден с первого кадра — отсчёт начинается с единицы */}
      <Text style={styles.percent}>{Math.round(percent)}%</Text>
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
  word: { flexDirection: 'row', alignItems: 'baseline' },
  letter: {
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  percent: {
    marginTop: rs(24),
    fontSize: rf(17),
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.85)',
  },
});
