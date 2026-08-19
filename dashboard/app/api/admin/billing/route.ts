import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Основание для счёта: сколько состоявшихся выходов у какой компании.
 *
 * Тарифа ещё нет, эквайринга тоже — но событие, за которое берут деньги,
 * происходит уже сейчас. Эта страница отвечает на вопрос «за что выставлять»,
 * а не «сколько». Второе решается не кодом.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }
  const secret = process.env.EXPO_PUBLIC_APP_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'EXPO_PUBLIC_APP_SECRET не задан на сервере' },
      { status: 500, headers: CORS })
  }
  const u = new URL(req.url)
  try {
    const res = await fetch('https://jobtoo.ru/api/db.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': secret },
      body: JSON.stringify({
        fn: 'billingReport',
        args: [u.searchParams.get('from') ?? '', u.searchParams.get('to') ?? ''],
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error ?? 'Ошибка запроса')
    return NextResponse.json(data.data, { headers: CORS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: CORS })
  }
}
