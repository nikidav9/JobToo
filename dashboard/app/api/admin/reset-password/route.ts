import { NextResponse } from 'next/server'
import { serverSupabase } from '@/lib/serverSupabase'
import { isAdmin } from '@/lib/requireAdmin'
import bcrypt from 'bcryptjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  // Сброс чужого пароля — самое опасное, что здесь есть, поэтому пускаем
  // только вошедшего в дашборд, а не по секрету из бандла.
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const { userId } = await req.json()
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400, headers: CORS })
  }

  let supabase
  try {
    supabase = serverSupabase()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500, headers: CORS })
  }

  const newPassword = Math.random().toString(36).slice(2, 8).toUpperCase()
  const hashed = await bcrypt.hash(newPassword, 10)

  const { data, error } = await supabase
    .from('jm_users')
    .update({ password: hashed })
    .eq('id', userId)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  }
  // Без .select() запрос по несуществующему id проходил без ошибки, и дашборд
  // показывал пароль, которого ни у кого нет.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404, headers: CORS })
  }

  return NextResponse.json({ ok: true, password: newPassword }, { headers: CORS })
}
