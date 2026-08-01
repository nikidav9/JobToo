import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Телеграм-рассылка из дашборда.
 *
 * Раньше страница звала jobtoo.ru/api/db.php прямо из браузера и несла
 * X-App-Secret с собой — то есть пропуск к прокси лежал в бандле дашборда.
 * Теперь браузер приходит сюда со своим токеном, а секрет подставляется на
 * сервере и наружу не попадает.
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

  const { title, body, role = 'all' } = await req.json()
  if (!title || !body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400, headers: CORS })
  }

  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret },
    body: JSON.stringify({ fn: 'tgBroadcast', args: [title, body, role] }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error ?? 'Ошибка Telegram-рассылки' },
      { status: 502, headers: CORS }
    )
  }
  return NextResponse.json(data, { headers: CORS })
}
