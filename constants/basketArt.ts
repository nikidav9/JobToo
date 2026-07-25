import type { Stroke } from '@/components/SplashLoader';

// Загрузочный арт: корзина рисуется линией, затем над ней плавно опускаются
// три продукта, и в конце разлетаются искорки движения.
// Система координат — 200×250.

export const BASKET_STROKES: Stroke[] = [
  // ручка
  { d: 'M 68 148 Q 70 100 100 98 Q 130 100 132 148', len: 136, from: 0.00, to: 0.14 },
  // обод
  { d: 'M 28 150 Q 100 137 172 150', len: 150, from: 0.12, to: 0.26 },
  { d: 'M 28 150 Q 100 163 172 150', len: 150, from: 0.24, to: 0.36 },
  // корпус
  { d: 'M 34 153 L 55 231 Q 57 240 67 240 L 133 240 Q 143 240 145 231 L 166 153', len: 264, from: 0.34, to: 0.66 },
  // плетение — вертикали
  { d: 'M 60 160 L 70 236', len: 78, from: 0.63, to: 0.72, w: 2.4 },
  { d: 'M 86 158 L 90 239', len: 82, from: 0.67, to: 0.76, w: 2.4 },
  { d: 'M 114 158 L 110 239', len: 82, from: 0.71, to: 0.80, w: 2.4 },
  { d: 'M 140 160 L 130 236', len: 78, from: 0.75, to: 0.84, w: 2.4 },
  // плетение — горизонталь
  { d: 'M 44 196 Q 100 205 156 196', len: 116, from: 0.82, to: 1.00, w: 2.4 },
];

// Искорки движения — дорисовываются после того, как продукты легли
export const SPARK_STROKES: Stroke[] = [
  { d: 'M 22 116 L 12 106', len: 15, from: 0.00, to: 0.30, w: 2.6 },
  { d: 'M 178 114 L 188 104', len: 15, from: 0.15, to: 0.45, w: 2.6 },
  { d: 'M 100 18 L 100 8', len: 11, from: 0.30, to: 0.60, w: 2.6 },
  { d: 'M 58 40 L 51 32', len: 11, from: 0.45, to: 0.75, w: 2.6 },
  { d: 'M 146 38 L 154 30', len: 11, from: 0.60, to: 1.00, w: 2.6 },
];

// Продукт: собственный viewBox, позиция в системе координат арта (левый
// верхний угол) и штрихи. Лежат над корзиной — будто их только что положили.
export type Product = {
  w: number; h: number; left: number; top: number;
  paths: { d: string; w?: number; t?: string }[];
};

export const PRODUCTS: Product[] = [
  // бутылка (слева, с наклоном)
  {
    w: 30, h: 54, left: 32, top: 60,
    paths: [
      { d: 'M 6 48 L 4 24 Q 3 17 8 14 L 8 4 L 22 4 L 22 14 Q 27 17 26 24 L 24 48 Q 15 52 6 48 Z', t: 'rotate(-16 14 28)' },
      { d: 'M 8 10 L 22 10', w: 2.4, t: 'rotate(-16 14 28)' },
    ],
  },
  // яблоко (центр)
  {
    w: 40, h: 52, left: 80, top: 26,
    paths: [
      { d: 'M 20 14 A 18 18 0 1 1 19.99 14' },
      { d: 'M 20 15 L 23 2', w: 2.6 },
      { d: 'M 23 6 Q 35 0 37 10 Q 27 14 23 6 Z', w: 2.6 },
    ],
  },
  // булка (справа, с наклоном)
  {
    w: 44, h: 36, left: 132, top: 72,
    paths: [
      { d: 'M 4 22 Q 2 4 22 2 Q 42 4 40 22 Q 38 32 22 32 Q 6 32 4 22 Z', t: 'rotate(14 22 14)' },
      { d: 'M 13 11 L 19 17', w: 2.4, t: 'rotate(14 22 14)' },
      { d: 'M 24 9 L 30 15', w: 2.4, t: 'rotate(14 22 14)' },
    ],
  },
];

export const ART_VB_W = 200;
export const ART_VB_H = 250;

// Тайминги (мс от начала загрузки)
export const BASKET_DRAW_MS = 820;
export const PROD_FIRST_MS = 660;
export const PROD_STAGGER_MS = 200;
export const PROD_FALL_MS = 320;
export const SPARKS_AT_MS = 1400;
export const SPARKS_MS = 260;
