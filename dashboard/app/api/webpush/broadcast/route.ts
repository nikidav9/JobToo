import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { isAdmin } from '@/lib/requireAdmin'
import { serverSupabase } from '@/lib/serverSupabase'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token, x-app-secret',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  // Пускаем либо вошедшего в дашборд, либо сервер приложения с APP_SECRET:
  // рассылки зовёт и то, и другое. Публичного запасного значения больше нет.
  const secret = req.headers.get('x-app-secret')
  const expectedSecret = process.env.EXPO_PUBLIC_APP_SECRET || process.env.NEXT_PUBLIC_APP_SECRET
  const bySecret = Boolean(expectedSecret) && secret === expectedSecret
  if (!bySecret && !(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const { title, body } = await req.json()
  if (!title || !body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400, headers: CORS })
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

  let supabase
  try {
    supabase = serverSupabase()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS })
  }

  const { data: subs } = await supabase
    .from('jm_web_push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0 }, { headers: CORS })
  }

  let sent = 0
  let failed = 0
  const payload = JSON.stringify({ title, body })

  await Promise.all(subs.map(async (sub: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent++
    } catch {
      failed++
    }
  }))

  return NextResponse.json({ ok: true, sent, failed }, { headers: CORS })
}
