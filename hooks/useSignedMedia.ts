import { useEffect, useState } from 'react';
import { dbSignMedia } from '@/services/db';

/**
 * Ссылка на файл из переписки.
 *
 * Файлы чатов лежат в закрытом бакете, и прямой ссылки на них нет — есть
 * подписанная, которая живёт час. Поэтому перед показом её надо получить,
 * а через час, если экран всё ещё открыт, получить заново.
 *
 * Кэш общий на всё приложение: в переписке один и тот же файл рисуется в
 * списке и в самом чате, а иногда и по нескольку раз при перерисовке
 * списка. Без кэша каждая из них ходила бы на сервер за своей подписью.
 *
 * Старые сообщения хранят не путь, а полную публичную ссылку — так писали
 * до перехода на закрытый бакет. Их сюда можно передавать как есть: сервер
 * сам достанет путь, а если файл ещё не переехал, вернёт прежнюю ссылку.
 */

type Entry = { url: string; until: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();

/** На минуту меньше часа: чтобы ссылка не протухла ровно в момент показа. */
const TTL = 59 * 60 * 1000;

async function resolve(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;

  const running = inflight.get(key);
  if (running) return running;

  const p = dbSignMedia(key).then(url => {
    if (url) cache.set(key, { url, until: Date.now() + TTL });
    inflight.delete(key);
    return url;
  }).catch(() => { inflight.delete(key); return null; });

  inflight.set(key, p);
  return p;
}

export function useSignedMedia(pathOrUrl: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!pathOrUrl) return null;
    const hit = cache.get(pathOrUrl);
    return hit && hit.until > Date.now() ? hit.url : null;
  });

  useEffect(() => {
    if (!pathOrUrl) { setUrl(null); return; }
    let alive = true;
    resolve(pathOrUrl).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [pathOrUrl]);

  return url;
}
