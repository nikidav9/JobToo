import { Dimensions, PixelRatio } from 'react-native';

/**
 * Размеры под ширину экрана.
 *
 * Раньше все отступы и шрифты были вбиты числами, подобранными на одном
 * телефоне. На узком экране из-за этого всё сходилось впритык, на широком —
 * оставались пустые поля.
 *
 * Считаем от 375 точек — это ширина обычного iPhone, на котором вёрстка и
 * рисовалась. Множитель зажат в узких пределах намеренно: на 320 точках
 * (iPhone SE) выходит 0.85, на 430 (Pro Max) — 1.15, а дальше не растёт.
 * Без верхней границы на планшете и в окне браузера получились бы кнопки
 * в пол-экрана.
 */
const BASE_WIDTH = 375;
const MIN_FACTOR = 0.85;
const MAX_FACTOR = 1.15;

// Берём меньшую сторону: в альбомной ориентации и в широком окне браузера
// ширина перестаёт что-либо говорить о том, сколько места реально есть.
const { width, height } = Dimensions.get('window');
const shortest = Math.min(width, height);

const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, shortest / BASE_WIDTH));

// Шрифт тянем вдвое слабее отступов. Текст, уменьшенный на те же 15%,
// на маленьком экране читался бы заметно хуже, а выигрыш по месту даёт
// в основном сжатие отступов.
const fontFactor = 1 + (factor - 1) * 0.5;

/** Отступ, размер блока, скругление. */
export function rs(n: number): number {
  if (!n) return n;
  return PixelRatio.roundToNearestPixel(n * factor);
}

/** Размер шрифта и высота строки. */
export function rf(n: number): number {
  if (!n) return n;
  return PixelRatio.roundToNearestPixel(n * fontFactor);
}

/** Множитель — если размер нужно посчитать вручную, а не через rs(). */
export const scaleFactor = factor;
