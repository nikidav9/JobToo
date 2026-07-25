import { NextResponse } from 'next/server'
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
  if (secret !== process.env.EXPO_PUBLIC_APP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const { company } = await req.json()
  if (!company || typeof company !== 'string') {
    return NextResponse.json({ error: 'company required' }, { status: 400, headers: CORS })
  }

  let supabase
  try {
    supabase = serverSupabase()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS })
  }

  const validCompanies = ['Лавка', 'Самокат']

  // Fetch employers whose company is not already a valid choice
  const { data: targets, error: fetchErr } = await supabase
    .from('jm_users')
    .select('id, company')
    .eq('role', 'employer')

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500, headers: CORS })
  }

  const ids = (targets ?? [])
    .filter(u => !validCompanies.includes(u.company))
    .map(u => u.id)

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 }, { headers: CORS })
  }

  const { data, error } = await supabase
    .from('jm_users')
    .update({ company })
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 }, { headers: CORS })
}
