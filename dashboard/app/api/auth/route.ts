import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { login, password } = await req.json()

  const validLogin = process.env.DASHBOARD_LOGIN
  const validPassword = process.env.DASHBOARD_PASSWORD

  if (!validLogin || !validPassword) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  if (login === validLogin && password === validPassword) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false }, { status: 401 })
}
