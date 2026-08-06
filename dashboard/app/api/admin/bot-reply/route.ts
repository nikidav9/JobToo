import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Ответ человеку из дашборда — уходит от бота в телеграм.
 *
 * Секрет прокси подставляется здесь, на сервере: в браузер он не попадает,
 * как и в остальных админских маршрутах.
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

  const { telegramId, text } = await req.json()
  if (!telegramId || !text?.trim()) {
    return NextResponse.json({ error: 'Нужен адресат и текст' }, { status: 400, headers: CORS })
  }

  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret },
    body: JSON.stringify({ fn: 'botReply', args: [telegramId, text.trim()] }),
  })
  const body = await res.json().catch(() => null)

  if (!res.ok || body?.error) {
    return NextResponse.json({ error: body?.error ?? `Прокси ответил ${res.status}` },
      { status: 502, headers: CORS })
  }
  if (!body?.data?.ok) {
    // Чаще всего это значит, что человек заблокировал бота — так и скажем,
    // вместо безликого «не удалось».
    return NextResponse.json(
      { error: 'Телеграм не принял сообщение — скорее всего, бот заблокирован' },
      { status: 409, headers: CORS })
  }

  return NextResponse.json({ ok: true }, { headers: CORS })
}
