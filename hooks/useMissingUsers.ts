import { useEffect, useRef, useState } from 'react';
import { User } from '@/constants/types';
import { dbGetUserById } from '@/services/db';

/**
 * Догружает пользователей, которых ещё нет в общем списке.
 *
 * Общий список приходит не мгновенно, и в первые секунды карточки показывали
 * «Работник» вместо имени. Показывать заглушку вместо имени — полбеды; хуже,
 * что в чате на её месте подставлялось название компании, и работодателю
 * казалось, будто он переписывается с «Лавкой».
 *
 * Поэтому недостающих запрашиваем поимённо — так же, как это давно делает
 * экран чата. Уже запрошенные помним, чтобы не дёргать сервер по кругу:
 * список пользователей меняется часто, и эффект срабатывает на каждое
 * изменение.
 */
export function useMissingUsers(users: User[], neededIds: string[]) {
  const [extra, setExtra] = useState<Record<string, User>>({});
  const asked = useRef<Set<string>>(new Set());

  useEffect(() => {
    const missing = neededIds.filter(
      id => id && !asked.current.has(id) && !users.some(u => u.id === id),
    );
    if (missing.length === 0) return;

    let alive = true;
    missing.forEach(id => asked.current.add(id));

    Promise.all(
      missing.map(id =>
        dbGetUserById(id)
          .then(u => [id, u] as const)
          .catch(() => [id, null] as const),
      ),
    ).then(pairs => {
      if (!alive) return;
      const add: Record<string, User> = {};
      pairs.forEach(([id, u]) => { if (u) add[id] = u; });
      if (Object.keys(add).length) setExtra(prev => ({ ...prev, ...add }));
    });

    return () => { alive = false; };
  }, [users, neededIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ищет сначала в общем списке, потом среди догруженных. */
  return (id: string): User | undefined =>
    users.find(u => u.id === id) ?? extra[id];
}
