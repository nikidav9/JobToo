import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { serverSupabase } from '@/lib/serverSupabase'

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
  const expectedSecret = process.env.EXPO_PUBLIC_APP_SECRET || process.env.NEXT_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6'
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const { title, body } = await req.json()
  if (!title || !body) {
    return NextResponse.json({ error: 'title and body required' }, { status: 400, headers: CORS })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@jobtoo.ru',
    process.env.VAPID_PUBLIC_KEY || 'BMps5FNvS_ODiL0Rf2d76P8cy_xLh2C7EVXb9mHABkZLQz58mwUzTVzkle_5R0ACYR0IGD-zuS4cuYEhuvCMYE4',
    process.env.VAPID_PRIVATE_KEY || 'cH1PAj57qEc7EoaxILsIeAxPyAWWxLO0dUQnIictJgw',
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
