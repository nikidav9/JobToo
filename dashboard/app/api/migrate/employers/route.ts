import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

  const { data, error } = await supabaseAdmin
    .from('jm_users')
    .update({ company })
    .eq('role', 'employer')
    .or('company.is.null,company.eq.')
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 }, { headers: CORS })
}
