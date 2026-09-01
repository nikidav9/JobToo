import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Сброс чужого пароля.
 *
 * Раньше этот маршрут ходил в Supabase напрямую, своим ключом. Ключ отозвали,
 * и кнопка стала отвечать «Unregistered API key» — причём тому, кто её нажал,
 * а не тому, кто мог бы починить. Ключей должно быть меньше, а не больше:
 * рабочий лежит на хостинге, за ним и ходим, как ходят остальные страницы
 * дашборда. Заодно отсюда ушёл bcrypt — хеширует тот, кто хранит.
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
  // Сброс чужого пароля — самое опасное, что здесь есть, поэтому пускаем
  // только вошедшего в дашборд, а не по секрету из бандла.
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

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400, headers: CORS })
  }

  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret, 'X-Admin-Token': process.env.ADMIN_API_TOKEN ?? '' },
    body: JSON.stringify({ fn: 'adminResetPassword', args: [userId] }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok || body?.error) {
    return NextResponse.json(
      { error: body?.error ?? `Прокси ответил ${res.status}` },
      { status: 502, headers: CORS }
    )
  }
  if (!body?.data?.ok) {
    return NextResponse.json(
      { error: body?.data?.reason === 'not_found' ? 'Пользователь не найден' : 'Не удалось сбросить' },
      { status: 404, headers: CORS }
    )
  }

  return NextResponse.json({ ok: true, password: body.data.password }, { headers: CORS })
}
