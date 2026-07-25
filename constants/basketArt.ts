import type { Stroke } from '@/components/SplashLoader';

// Загрузочный арт: корзина рисуется линией, затем в неё один за другим
// плавно опускаются продукты. Система координат — 200×210.

export const BASKET_STROKES: Stroke[] = [
  // обод
  { d: 'M 26 130 Q 100 121 174 130', len: 150, from: 0.00, to: 0.20 },
  { d: 'M 26 130 Q 100 139 174 130', len: 150, from: 0.16, to: 0.36 },
  // корпус
  { d: 'M 30 134 L 42 186 Q 43 194 51 194 L 149 194 Q 157 194 158 186 L 170 134', len: 232, from: 0.32, to: 0.68 },
  // плетение — вертикали
  { d: 'M 52 138 L 60 190', len: 53, from: 0.64, to: 0.74, w: 2.4 },
  { d: 'M 78 136 L 80 192', len: 56, from: 0.68, to: 0.78, w: 2.4 },
  { d: 'M 122 136 L 120 192', len: 56, from: 0.72, to: 0.82, w: 2.4 },
  { d: 'M 148 138 L 140 190', len: 53, from: 0.76, to: 0.86, w: 2.4 },
  // плетение — горизонтали
  { d: 'M 36 156 Q 100 165 164 156', len: 130, from: 0.82, to: 0.92, w: 2.4 },
  { d: 'M 41 176 Q 100 184 159 176', len: 120, from: 0.88, to: 1.00, w: 2.4 },
];

// Продукт: собственный viewBox, позиция в системе координат арта (левый
// верхний угол) и штрихи. Низ у всех ≈132 — ровно по ободу корзины, поэтому
// выглядит, будто товар лёг внутрь.
export type Product = {
  w: number; h: number; left: number; top: number; paths: { d: string; w?: number }[];
};

export const PRODUCTS: Product[] = [
  // пакет молока
  {
    w: 26, h: 46, left: 55, top: 86,
    paths: [{ d: 'M 2 44 L 2 16 L 13 4 L 24 16 L 24 44 Z' }, { d: 'M 2 16 L 24 16', w: 2.4 }],
  },
  // яблоко
  {
    w: 28, h: 32, left: 89, top: 100,
    paths: [
      { d: 'M 14 8 A 11 11 0 1 1 13.99 8' },
      { d: 'M 14 8 L 16 2', w: 2.4 },
      { d: 'M 16 4 Q 22 1 23 6 Q 18 8 16 4', w: 2.4 },
    ],
  },
  // бутылка
  {
    w: 20, h: 50, left: 125, top: 82,
    paths: [
      { d: 'M 3 48 L 3 22 Q 3 15 7 13 L 7 4 L 15 4 L 15 13 Q 19 15 19 22 L 19 48 Z' },
      { d: 'M 7 9 L 15 9', w: 2.4 },
    ],
  },
];

export const ART_VB_W = 200;
export const ART_VB_H = 210;

// Тайминги укладки товаров (мс от начала загрузки)
export const BASKET_DRAW_MS = 820;
export const PROD_FIRST_MS = 660;
export const PROD_STAGGER_MS = 200;
export const PROD_FALL_MS = 320;
