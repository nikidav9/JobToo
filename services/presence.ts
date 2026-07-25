// «В сети» / «был в сети …» — из отметки last_seen_at, которую приложение
// обновляет раз в две минуты. Порог в три минуты выбран с запасом: отметка
// успевает обновиться до того, как человек «погаснет» на глазах собеседника.

const ONLINE_MS = 3 * 60 * 1000;

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function isOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ONLINE_MS;
}

/**
 * Строка под именем в чате. Женский род не угадываем — пишем «был(а)»,
 * пола в профиле нет.
 */
export function lastSeenLabel(lastSeenAt?: string | null): string | null {
  if (!lastSeenAt) return null;
  const d = new Date(lastSeenAt);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;

  const diff = Date.now() - t;
  if (diff < ONLINE_MS) return 'в сети';
  if (diff < 0) return 'в сети';

  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `был(а) ${mins} мин назад`;

  const hours = Math.floor(mins / 60);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return `был(а) сегодня в ${hh}`;

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `был(а) вчера в ${hh}`;

  if (hours < 24 * 7) {
    return `был(а) ${d.getDate()} ${MONTHS_RU[d.getMonth()]} в ${hh}`;
  }
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `был(а) ${d.getDate()} ${MONTHS_RU[d.getMonth()]}${year}`;
}
