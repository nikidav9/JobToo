import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/requireAdmin'

/**
 * Ответ поддержки. Уходит человеку в приложение и всеми каналами, какие у
 * него есть, — он ждёт именно его.
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
    return NextResponse.json({ error: 'EXPO_PUBLIC_APP_SECRET не задан на сервере' },
      { status: 500, headers: CORS })
  }

  const { userId, text } = await req.json()
  if (!userId || !text?.trim()) {
    return NextResponse.json({ error: 'Нужен адресат и текст' }, { status: 400, headers: CORS })
  }

  const res = await fetch('https://jobtoo.ru/api/db.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Secret': appSecret },
    body: JSON.stringify({ fn: 'supportReply', args: [userId, text.trim()] }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.error || !body?.data?.ok) {
    return NextResponse.json({ error: body?.error ?? 'Не удалось отправить' },
      { status: 502, headers: CORS })
  }
  return NextResponse.json({ ok: true }, { headers: CORS })
}
