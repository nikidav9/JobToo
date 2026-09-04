import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Опрос спящих соискателей «почему не пользуетесь» — отправка и итоги.
 * Как и прочие админ-роуты: браузер приходит со своим токеном, секрет к
 * прокси подставляется на сервере и наружу не попадает.
 *
 * body: { mode: 'send' | 'results' }
 *  - send    → рассылает опрос спящим (last_seen пусто или > 30 дней);
 *  - results → возвращает сводку ответов.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const appSecret = process.env.EXPO_PUBLIC_APP_SECRET
  if (!appSecret) {
    return NextResponse.json(
      { error: 'EXPO_PUBLIC_APP_SECRET не задан на сервере' },
      { status: 500, headers: CORS }
    )
  }

  const { mode = 'results' } = await req.json().catch(() => ({}))
  const fn = mode === 'send' ? 'surveyDormantSend' : 'surveyResults'

  // Адрес db.php берём из того же базового адреса, что и проверка админа
  // (requireAdmin / ADMIN_API_URL): если дашборд настроен на рабочее имя, а не
  // на фильтруемый jobtoo.ru, ходим туда же. Иначе — прежний дефолт.
  const adminBase = process.env.ADMIN_API_URL || process.env.NEXT_PUBLIC_ADMIN_PROXY_URL || 'https://jobtoo.ru/api/admin.php'
  const dbUrl = adminBase.replace(/\/[^/]+\.php(\?.*)?$/, '/db.php')

  // Таймаут: без него зависший запрос к прокси убивает функцию, и в браузере
  // видно лишь «Load failed». С таймаутом вернём понятную причину.
  const ac = new AbortController()
  const timeoutMs = mode === 'send' ? 55000 : 12000
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  let res: Response
  let raw = ''
  try {
    res = await fetch(dbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret, 'X-Admin-Token': process.env.ADMIN_API_TOKEN ?? '' },
      body: JSON.stringify({ fn, args: [] }),
      signal: ac.signal,
    })
    raw = await res.text()
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return NextResponse.json(
      { error: aborted
          ? `Прокси не ответил за ${Math.round(timeoutMs / 1000)}с (${dbUrl}). Часть отправки могла пройти — нажмите ещё раз, уже отправленным не повторится.`
          : 'Не дозвонились до прокси: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 502, headers: CORS }
    )
  } finally {
    clearTimeout(timer)
  }

  let data: any = null
  try { data = raw ? JSON.parse(raw) : null } catch { /* ниже отдадим сырой текст */ }
  if (!res.ok || !data || data.error) {
    return NextResponse.json(
      { error: (data && data.error) ? data.error : `Прокси ответил ${res.status}: ${raw.slice(0, 300)}` },
      { status: 502, headers: CORS }
    )
  }
  return NextResponse.json(data, { headers: CORS })
}
