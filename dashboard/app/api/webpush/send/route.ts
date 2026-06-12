import { NextResponse } from 'next/server'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-app-secret')
  if (secret !== process.env.EXPO_PUBLIC_APP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

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
