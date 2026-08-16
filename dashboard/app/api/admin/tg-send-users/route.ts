import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Личные сообщения боту по списку людей.
 *
 * Отличается от рассылки не только адресатами. Рассылка идёт «всем, у кого
 * есть телеграм», а здесь список приходит с экрана — те, кого мы выбрали
 * глазами. Текст обращается по имени: {name} подставляется на сервере.
 *
 * Секрет, как и в остальных админских маршрутах, живёт здесь и в браузер не
 * попадает: страница приходит со своим токеном.
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

  const { ids, template } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0 || !template) {
    return NextResponse.json({ error: 'нужны список и текст' }, { status: 400, headers: CORS })
  }

  // Ограничение сверху — не про нагрузку, а про цену ошибки. Отправленное
  // сообщение не отзывается: промах в тексте на трёхстах адресатах уже не
  // исправить. Порциями по сотне промах виден после первой.
  if (ids.length > 100) {
    return NextResponse.json(
      { error: 'за раз не больше 100 адресатов — отправляйте порциями' },
      { status: 400, headers: CORS }
    )
  }

  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret },
    body: JSON.stringify({ fn: 'tgSendToUsers', args: [ids, template] }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error ?? 'Ошибка отправки' },
      { status: 502, headers: CORS }
    )
  }
  return NextResponse.json(data, { headers: CORS })
}
