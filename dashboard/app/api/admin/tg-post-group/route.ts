import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Ручная публикация в общую группу «ПОДРАБОТКИ».
 *
 * Обычно объявление о новой вакансии уходит в группу само — внутри рассылки
 * при создании вакансии. Но если у клиента в тот момент оборвалась сеть,
 * вызов рассылки терялся: вакансия в ленте есть, а поста в группе нет.
 * Раньше досылать было нечем — приходилось лезть на сервер руками. Этот
 * маршрут даёт кнопку в дашборде: пишем тот же пост в группу через db.php.
 *
 * Куда именно постить — решает сервер (TG_GROUP_CHAT_ID), из запроса адрес
 * группы не принимаем. Секрет живёт здесь и в браузер не попадает.
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

  const { text } = await req.json()
  if (typeof text !== 'string' || text.trim() === '') {
    return NextResponse.json({ error: 'нужен текст' }, { status: 400, headers: CORS })
  }

  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret, 'X-Admin-Token': process.env.ADMIN_API_TOKEN ?? '' },
    body: JSON.stringify({ fn: 'tgPostToGroup', args: [text] }),
  })
  const data = await res.json()
  if (!res.ok || data.error || data.sent === false) {
    return NextResponse.json(
      { error: data.error ?? 'Не удалось опубликовать в группу' },
      { status: 502, headers: CORS }
    )
  }
  return NextResponse.json(data, { headers: CORS })
}
