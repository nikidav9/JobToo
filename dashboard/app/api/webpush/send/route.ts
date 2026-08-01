import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { isAdmin } from '@/lib/requireAdmin'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, x-app-secret',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  // Сперва пропуск, потом всё остальное: иначе по ответу видно, что задано
  // на сервере, ещё до всякой проверки.
  // Пускаем либо вошедшего в дашборд, либо сервер приложения с APP_SECRET:
  // рассылки зовёт и то, и другое. Публичного запасного значения больше нет.
  const secret = req.headers.get('x-app-secret')
  const expectedSecret = process.env.EXPO_PUBLIC_APP_SECRET || process.env.NEXT_PUBLIC_APP_SECRET
  const bySecret = Boolean(expectedSecret) && secret === expectedSecret
  if (!bySecret && !(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  // Приватный ключ VAPID — настоящий секрет: с ним можно рассылать пуши от
  // имени JobToo. Запасного значения в коде нет; нет переменной — нет рассылки.
  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json(
      { error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY не заданы на сервере' },
      { status: 500, headers: CORS }
    )
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@jobtoo.ru',
    vapidPublic,
    vapidPrivate,
  )

  const { subscription, title, body, data } = await req.json()
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400, headers: CORS })
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, data }))
    return NextResponse.json({ ok: true }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS })
  }
}
