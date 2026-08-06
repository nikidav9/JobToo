import { WorkType } from '@/constants/types';

/**
 * Как показывать оплату за смену.
 *
 * У кладовщика оплата сдельная: директор указывает, сколько примерно выходит
 * за смену, но настоящая сумма зависит от выработки. Если написать «3 000 ₽»
 * без оговорки, человек придёт за тремя тысячами, получит две с половиной и
 * будет прав, считая себя обманутым. Поэтому у сдельных ролей число всегда
 * идёт со знаком «примерно» и с объяснением рядом.
 *
 * У старшего смены оплата фиксированная — там оговорка была бы враньём в
 * другую сторону.
 */

export function isEstimatedPay(workType?: WorkType | string | null): boolean {
  return workType === 'stocker';
}

/** Короткая надпись для карточки: «≈ 3 000 ₽» или «3 000 ₽». */
export function payShort(salary?: number | null, workType?: WorkType | string | null): string | undefined {
  if (!salary || salary <= 0) return undefined;
  const n = salary.toLocaleString('ru-RU');
  return isEstimatedPay(workType) ? `≈ ${n} ₽` : `${n} ₽`;
}

/** Пояснение под суммой — только там, где сумма приблизительная. */
export const PAY_ESTIMATE_HINT =
  'Примерная сумма за смену. Оплата сдельная: сколько выйдет на самом деле, '
  + 'зависит от выработки и нормативов склада — они указаны ниже.';
