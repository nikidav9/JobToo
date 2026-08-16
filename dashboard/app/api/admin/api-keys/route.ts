import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Ключи внешнего API: список, выдача, отзыв.
 *
 * Всё через прокси и его секрет, как остальные админские маршруты, — в
 * браузер секрет не попадает. Сам ключ партнёра возвращается ровно один раз,
 * в ответе на создание: дальше в базе только отпечаток, и показать его снова
 * не сможем даже мы.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

async function call(fn: string, args: unknown[]) {
  const appSecret = process.env.EXPO_PUBLIC_APP_SECRET
  if (!appSecret) throw new Error('EXPO_PUBLIC_APP_SECRET не задан на сервере')
  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret },
    body: JSON.stringify({ fn, args }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? 'Ошибка запроса')
  return data.data
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }
  try {
    return NextResponse.json({ items: await call('apiKeysList', []) }, { headers: CORS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: CORS })
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }
  const { name, scopes, rate_limit } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Нужно имя — по нему потом искать, чей это ключ' },
      { status: 400, headers: CORS })
  }
  try {
    const data = await call('apiKeyCreate', [name.trim(), scopes ?? ['vacancies:read'], rate_limit ?? 1000])
    return NextResponse.json(data, { headers: CORS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: CORS })
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Нужен id' }, { status: 400, headers: CORS })
  try {
    return NextResponse.json(await call('apiKeyRevoke', [id]), { headers: CORS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: CORS })
  }
}
