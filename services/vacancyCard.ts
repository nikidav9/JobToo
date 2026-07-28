import { Vacancy, PermVacancy } from '@/constants/types';
import { formatDate } from '@/services/storage';

/**
 * Короткая справка о вакансии — та самая, что уходит в переписку первым
 * системным сообщением.
 *
 * Повторяет vacancy_card_text из php-proxy/db.php. Держим отдельно, чтобы
 * человек в окне отклика видел ровно то, что потом окажется в чате: если
 * тексты разойдутся, отклик будет выглядеть как про другую вакансию.
 */

export function vacancyInfoLines(v: Vacancy): string[] {
  const lines = [`Смена: ${v.title}`];
  const day = v.date ? formatDate(v.date) : '';
  const time = v.timeStart && v.timeEnd ? `${v.timeStart}–${v.timeEnd}` : '';
  const when = [day, time].filter(Boolean).join(', ');
  if (when) lines.push(`Когда: ${when}`);
  const where = v.address || (v.metroStation ? `м. ${v.metroStation}` : '');
  if (where) lines.push(`Где: ${where}`);
  return lines;
}

export function permVacancyInfoLines(v: PermVacancy): string[] {
  const lines = [`Постоянная работа: ${v.title}`];
  if (v.schedule) lines.push(`График: ${v.schedule}`);
  const where = v.address || (v.metroStation ? `м. ${v.metroStation}` : '');
  if (where) lines.push(`Где: ${where}`);
  return lines;
}
