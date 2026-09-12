import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions, LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  interpolate, Extrapolation, runOnJS, cancelAnimation,
} from 'react-native-reanimated';

const { width: SW } = Dimensions.get('window');

/** Сколько карточка должна уехать вбок, чтобы отпускание засчиталось решением. */
export const SWIPE_THRESHOLD = 80;
/** Быстрый бросок засчитывается и без этого расстояния. Пиксели в миллисекунду. */
export const VELOCITY_THRESHOLD = 0.3;

// Максимальный наклон — на полный экран смещения. У Tinder карточка кренится
// заметно, около пятнадцати градусов; прежние восемь читались как «залипла».
const MAX_ROTATION = 15;

// Возврат на место. Жёстко и почти без отскока: карточка должна вернуться
// раньше, чем человек успеет задуматься, вернулась ли она.
const SPRING = { damping: 20, stiffness: 260, mass: 0.7 } as const;

export interface SwipeDeckHandlers {
  /** Отпустили вправо — принять. vx в пикселях на миллисекунду. */
  want: (vx: number) => void;
  /** Отпустили влево — отклонить. */
  skip: (vx: number) => void;
}

/**
 * Физика колоды карточек — как в Tinder.
 *
 * Tinder написан нативно (Swift/SwiftUI на iOS, Kotlin/Compose на Android),
 * так что копировать было нечего; повторено поведение, а не код. Что именно
 * повторено и почему:
 *
 * 1. Карточка следует за пальцем по обеим осям, а не по одной горизонтали.
 *    Вертикаль раньше игнорировалась, и карточка «ехала по рельсам» — это и
 *    читалось как чужая, механическая анимация.
 *
 * 2. Наклон зависит от точки захвата. Взяли за верх и повели вправо — низ
 *    отстаёт, карточка кренится по часовой; взяли за низ — против. Именно это
 *    даёт ощущение, что в руке лист бумаги, а не картинка. Сторона
 *    запоминается в onBegin: посреди жеста она меняться не должна.
 *
 * 3. Всё считается на потоке интерфейса. Обработчики жеста — ворклеты,
 *    значения общие (shared values), стили анимированные. Прежний Animated с
 *    useNativeDriver: false гнал каждый кадр через мост JS, и на слабом
 *    телефоне карточка отставала от пальца.
 *
 * 4. Карточка снизу подрастает, пока верхняя уезжает, — колода живая.
 *
 * Порогов на вертикаль (failOffsetY) здесь намеренно нет: внутри карточки
 * больше нет прокрутки, спорить за жест не с кем. Ровно по этой причине
 * вертикаль и удалось отдать карточке.
 */
export function useSwipeDeck(handlers: SwipeDeckHandlers) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  // +1 — взяли за верхнюю половину, -1 — за нижнюю.
  const rotDir = useSharedValue(1);
  // Карточка уже уезжает: жест её не трогает, второго решения не будет.
  const busy = useSharedValue(false);
  const cardH = useSharedValue(0);

  // Обработчики пересоздаются на каждом отрисовке (замыкают состояние), а жест
  // собирается один раз. Через ссылку жест всегда зовёт свежие.
  const h = useRef(handlers);
  useEffect(() => { h.current = handlers; });

  const callWant = useCallback((vx: number) => h.current.want(vx), []);
  const callSkip = useCallback((vx: number) => h.current.skip(vx), []);

  const onCardLayout = useCallback((e: LayoutChangeEvent) => {
    cardH.value = e.nativeEvent.layout.height;
  }, [cardH]);

  /** Мгновенно вернуть карточку в исходное — при смене колоды. */
  const reset = useCallback(() => {
    cancelAnimation(x);
    cancelAnimation(y);
    x.value = 0;
    y.value = 0;
    busy.value = false;
  }, [x, y, busy]);

  /** Пружиной вернуть на место: решение не принято. */
  const snapBack = useCallback(() => {
    busy.value = false;
    x.value = withSpring(0, SPRING);
    y.value = withSpring(0, SPRING);
  }, [x, y, busy]);

  /**
   * Улёт за край экрана. after() зовётся, когда карточка долетела, — колода
   * меняется уже после анимации, иначе следующая карточка появлялась бы под
   * ещё летящей.
   */
  const flyOut = useCallback((dir: 'left' | 'right', vx: number, after: () => void) => {
    if (busy.value) return;
    busy.value = true;
    // Чем сильнее бросок, тем быстрее улёт: карточка продолжает движение руки,
    // а не проигрывает одну и ту же анимацию на любой скорости.
    const duration = Math.max(180, Math.min(300, 250 / (Math.abs(vx) + 0.5)));
    y.value = withTiming(dir === 'right' ? -40 : 40, { duration });
    x.value = withTiming((dir === 'right' ? 1 : -1) * SW * 1.5, { duration }, finished => {
      'worklet';
      if (!finished) return;
      x.value = 0;
      y.value = 0;
      busy.value = false;
      runOnJS(after)();
    });
  }, [x, y, busy]);

  const gesture = useMemo(
    () => Gesture.Pan()
      // Восемь пикселей в любую сторону, а не только вбок: карточка должна
      // отзываться и на движение вверх-вниз. Небольшой порог оставлен, чтобы
      // нажатия внутри карточки (подробности, «поделиться») не съедались.
      .minDistance(8)
      .onBegin(e => {
        'worklet';
        const half = cardH.value > 0 ? cardH.value / 2 : 0;
        rotDir.value = half > 0 && e.y > half ? -1 : 1;
      })
      .onUpdate(e => {
        'worklet';
        if (busy.value) return;
        x.value = e.translationX;
        y.value = e.translationY;
      })
      .onEnd(e => {
        'worklet';
        if (busy.value) return;
        // Скорость приходит в пикселях в секунду, пороги здесь в пикселях на
        // миллисекунду. Без деления любое касание считалось бы броском.
        const vx = e.velocityX / 1000;
        const dx = e.translationX;
        if (dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) {
          runOnJS(callWant)(Math.abs(vx));
        } else if (dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) {
          runOnJS(callSkip)(Math.abs(vx));
        } else {
          x.value = withSpring(0, SPRING);
          y.value = withSpring(0, SPRING);
        }
      }),
    [x, y, busy, rotDir, cardH, callWant, callSkip],
  );

  const cardStyle = useAnimatedStyle(() => {
    'worklet';
    const rot = interpolate(x.value, [-SW, 0, SW], [-MAX_ROTATION, 0, MAX_ROTATION], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value },
        { rotate: `${rot * rotDir.value}deg` },
      ],
    };
  });

  const wantStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: interpolate(x.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP) };
  });

  const skipStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: interpolate(-x.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP) };
  });

  // Колода под верхней карточкой. Пока верхняя уезжает, вторая занимает её
  // место, третья — место второй. Ход считается от того, насколько верхняя
  // ушла вбок, поэтому колода отзывается на палец, а не дёргается после.
  //
  // Прогресс один на обе, но стили отдельные: useAnimatedStyle — хук, и
  // вызывать его из вспомогательной функции значит заводить хук внутри хука.
  const nextCardStyle = useAnimatedStyle(() => {
    'worklet';
    const p = interpolate(Math.abs(x.value), [0, SW / 2], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0, 1], [0.5, 1]),
      transform: [
        { scale: interpolate(p, [0, 1], [0.97, 1]) },
        { translateY: interpolate(p, [0, 1], [6, 0]) },
      ],
    };
  });

  const thirdCardStyle = useAnimatedStyle(() => {
    'worklet';
    const p = interpolate(Math.abs(x.value), [0, SW / 2], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0, 1], [0.3, 0.5]),
      transform: [
        { scale: interpolate(p, [0, 1], [0.94, 0.97]) },
        { translateY: interpolate(p, [0, 1], [12, 6]) },
      ],
    };
  });

  // Объект собирается один раз: иначе он менялся бы на каждой отрисовке и
  // тянул бы за собой перезапуск всего, что на него смотрит.
  return useMemo(() => ({
    gesture, cardStyle, wantStyle, skipStyle,
    nextCardStyle, thirdCardStyle,
    onCardLayout, flyOut, snapBack, reset,
  }), [gesture, cardStyle, wantStyle, skipStyle, nextCardStyle, thirdCardStyle,
       onCardLayout, flyOut, snapBack, reset]);
}
