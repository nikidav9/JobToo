import { NextResponse } from 'next/server'
import webpush from 'web-push'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-app-secret',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@jobtoo.ru',
    process.env.VAPID_PUBLIC_KEY || 'BMps5FNvS_ODiL0Rf2d76P8cy_xLh2C7EVXb9mHABkZLQz58mwUzTVzkle_5R0ACYR0IGD-zuS4cuYEhuvCMYE4',
    process.env.VAPID_PRIVATE_KEY || 'cH1PAj57qEc7EoaxILsIeAxPyAWWxLO0dUQnIictJgw',
  )

  const secret = req.headers.get('x-app-secret')
  const expectedSecret = process.env.EXPO_PUBLIC_APP_SECRET || process.env.NEXT_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6'
  if (secret !== expectedSecret) {
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
