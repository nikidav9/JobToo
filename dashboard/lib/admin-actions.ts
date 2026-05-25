import { supabaseAdmin } from './supabase'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function blockUser(userId: string, block: boolean) {
  const { error } = await supabaseAdmin
    .from('jm_users')
    .update({ is_blocked: block })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function resetPassword(userId: string): Promise<string> {
  const newPassword = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { error } = await supabaseAdmin
    .from('jm_users')
    .update({ password: newPassword })
    .eq('id', userId)
  if (error) throw new Error(error.message)

  // Send push notification if token exists
  const { data } = await supabaseAdmin
    .from('jm_users')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle()
  if (data?.push_token) {
    await sendPushToToken(data.push_token, '🔑 Новый пароль', `Ваш новый пароль: ${newPassword}`)
  }
  return newPassword
}

export async function sendPushToUser(userId: string, title: string, body: string) {
  const { data } = await supabaseAdmin
    .from('jm_users')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle()
  if (!data?.push_token) throw new Error('У пользователя нет push-токена')
  await sendPushToToken(data.push_token, title, body)
}

// ─── Vacancies ────────────────────────────────────────────────────────────────

export async function setVacancyStatus(id: string, status: 'open' | 'closed') {
  const { error } = await supabaseAdmin
    .from('jm_vacancies')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setVacancyUrgent(id: string, urgent: boolean) {
  const { error } = await supabaseAdmin
    .from('jm_vacancies')
    .update({ is_urgent: urgent })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteVacancy(id: string) {
  const { error } = await supabaseAdmin
    .from('jm_vacancies')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setPermVacancyStatus(id: string, status: 'open' | 'closed') {
  const { error } = await supabaseAdmin
    .from('jm_perm_vacancies')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deletePermVacancy(id: string) {
  const { error } = await supabaseAdmin
    .from('jm_perm_vacancies')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Chats / System messages ─────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 14)
}

export async function sendSystemMessage(chatId: string, text: string) {
  const { error } = await supabaseAdmin
    .from('jm_messages')
    .insert({ id: uid(), chat_id: chatId, sender_id: 'system', text, created_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

// ─── Complaints ──────────────────────────────────────────────────────────────

export async function dismissComplaint(id: string) {
  const { error } = await supabaseAdmin
    .from('jm_complaints')
    .update({ status: 'dismissed' } as any)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function resolveComplaintAndBlock(complaintId: string, targetUserId: string) {
  await blockUser(targetUserId, true)
  await supabaseAdmin
    .from('jm_complaints')
    .update({ status: 'resolved' } as any)
    .eq('id', complaintId)
}

// ─── Broadcast push ──────────────────────────────────────────────────────────

export async function broadcastPush(
  target: 'all' | 'workers' | 'employers' | 'metro',
  title: string,
  body: string,
  metro?: string,
) {
  let query = supabaseAdmin.from('jm_users').select('push_token').not('push_token', 'is', null)
  if (target === 'workers') query = query.eq('role', 'worker')
  else if (target === 'employers') query = query.eq('role', 'employer')
  else if (target === 'metro' && metro) query = query.eq('metro_station', metro)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const tokens = (data ?? []).map((u: any) => u.push_token).filter(Boolean)
  if (tokens.length === 0) throw new Error('Нет пользователей с push-токеном')

  const messages = tokens.map((to: string) => ({
    to, title, body, sound: 'default', channelId: 'default', priority: 'high',
    data: { type: 'broadcast' },
  }))

  for (let i = 0; i < messages.length; i += 100) {
    await sendExpoBatch(messages.slice(i, i + 100))
  }
  return tokens.length
}

// ─── Push helpers ─────────────────────────────────────────────────────────────

async function sendPushToToken(token: string, title: string, body: string) {
  await sendExpoBatch([{ to: token, title, body, sound: 'default', channelId: 'default', priority: 'high', data: { type: 'admin' } }])
}

async function sendExpoBatch(messages: object[]) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  })
  if (!res.ok) throw new Error(`Expo API error: ${res.status}`)
}
