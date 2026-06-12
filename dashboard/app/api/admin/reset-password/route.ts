import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-dashboard-secret',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  // Protect with app secret (same as other API routes)
  const secret = req.headers.get('x-app-secret') || req.headers.get('x-dashboard-secret')
  const validSecret = process.env.EXPO_PUBLIC_APP_SECRET || process.env.DASHBOARD_PASSWORD
  if (!secret || secret !== validSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400, headers: CORS })
  }

  // Server-side Supabase client uses non-public env vars (bypasses client-side RLS issues)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500, headers: CORS })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const newPassword = Math.random().toString(36).slice(2, 8).toUpperCase()
  const hashed = await bcrypt.hash(newPassword, 10)

  const { error } = await supabase
    .from('jm_users')
    .update({ password: hashed })
    .eq('id', userId)

  if (error) {
    // Fallback: try saving plaintext (works if login handles both)
    const { error: error2 } = await supabase
      .from('jm_users')
      .update({ password: newPassword })
      .eq('id', userId)
    if (error2) {
      return NextResponse.json({ error: error2.message }, { status: 500, headers: CORS })
    }
  }

  return NextResponse.json({ ok: true, password: newPassword }, { headers: CORS })
}
