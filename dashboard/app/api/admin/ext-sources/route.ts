import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Источники чужих вакансий: список, сохранение, удаление, разовый заход.
 *
 * Секрет живёт здесь и в браузер не попадает — как в остальных админских
 * маршрутах. Адрес фида и заголовок доступа партнёра тем более: это его
 * ключ, и месту в бандле дашборда он не подлежит.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

function secret(): string {
  const s = process.env.EXPO_PUBLIC_APP_SECRET
  if (!s) throw new Error('EXPO_PUBLIC_APP_SECRET не задан на сервере')
  return s
}

async function call(fn: string, args: unknown[]) {
  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': secret() },
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
    // Сами вакансии — отдельным запросом и только по нажатию: их бывает
    // тысяча, и тянуть их на каждое открытие страницы незачем. Первый
    // вопрос здесь всегда «жив ли фид», а не «что именно в нём лежит».
    if (new URL(req.url).searchParams.get('vacancies')) {
      return NextResponse.json({ vacancies: await call('extVacancies', []) }, { headers: CORS })
    }
    const [items, stats] = await Promise.all([call('extSourcesList', []), call('extStats', [])])
    return NextResponse.json({ items, stats }, { headers: CORS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: CORS })
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }
  const body = await req.json()
  try {
    // Разовый заход по кнопке «Проверить сейчас». Расписание при этом не
    // сбивается: force относится только к этому вызову.
    if (body.run) {
      const res = await fetch(
        `https://jobtoo.ru/api/ingest.php?source=${encodeURIComponent(body.run)}&force=1`,
        { headers: { 'X-App-Secret': secret() } },
      )
      const data = await res.json()
      return NextResponse.json(data, { headers: CORS })
    }
    return NextResponse.json(await call('extSourceSave', [body]), { headers: CORS })
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
    return NextResponse.json(await call('extSourceDelete', [id]), { headers: CORS })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502, headers: CORS })
  }
}
