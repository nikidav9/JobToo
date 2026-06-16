import { supabaseAdmin } from './supabase'
import { logActivity } from './activity-log'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function deleteUser(userId: string, role: string, userName?: string) {
  // 1. Find chats involving this user
  const { data: chats } = await supabaseAdmin
    .from('jm_chats')
    .select('id')
    .or(`worker_id.eq.${userId},employer_id.eq.${userId}`)
  const chatIds = (chats ?? []).map((c: any) => c.id)

  // 2. Delete messages in those chats
  if (chatIds.length > 0) {
    await supabaseAdmin.from('jm_messages').delete().in('chat_id', chatIds)
  }

  // 3. Delete chats
  await supabaseAdmin.from('jm_chats').delete().or(`worker_id.eq.${userId},employer_id.eq.${userId}`)

  if (role === 'worker') {
    await supabaseAdmin.from('jm_likes').delete().eq('worker_id', userId)
    await supabaseAdmin.from('jm_perm_applications').delete().eq('worker_id', userId)
  } else {
    // Get vacancy IDs to cascade
    const [{ data: tempVacs }, { data: permVacs }] = await Promise.all([
      supabaseAdmin.from('jm_vacancies').select('id').eq('employer_id', userId),
      supabaseAdmin.from('jm_perm_vacancies').select('id').eq('employer_id', userId),
    ])
    const tempIds = (tempVacs ?? []).map((v: any) => v.id)
    const permIds = (permVacs ?? []).map((v: any) => v.id)

    if (tempIds.length > 0) await supabaseAdmin.from('jm_likes').delete().in('vacancy_id', tempIds)
    if (permIds.length > 0) await supabaseAdmin.from('jm_perm_applications').delete().in('vacancy_id', permIds)

    await supabaseAdmin.from('jm_vacancies').delete().eq('employer_id', userId)
    await supabaseAdmin.from('jm_perm_vacancies').delete().eq('employer_id', userId)
  }

  // Delete shared data
  await supabaseAdmin.from('jm_ratings').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
  await supabaseAdmin.from('jm_notifications').delete().eq('user_id', userId)
  await supabaseAdmin.from('jm_web_push_subscriptions').delete().eq('user_id', userId)

  const { error } = await supabaseAdmin.from('jm_users').delete().eq('id', userId)
  if (error) throw new Error(error.message)

  logActivity('Удалён пользователь', `ID: ${userId}, роль: ${role}`, userId, userName)
}

export async function blockUser(userId: string, block: boolean, userName?: string) {
  const { error } = await supabaseAdmin
    .from('jm_users')
    .update({ is_blocked: block })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  logActivity(block ? 'Заблокирован' : 'Разблокирован', `ID: ${userId}`, userId, userName)
}

export async function resetPassword(userId: string): Promise<string> {
  const res = await fetch('/api/admin/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': process.env.NEXT_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6',
    },
    body: JSON.stringify({ userId }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? 'Ошибка сброса пароля')
  return data.password as string
}

export async function sendPushToUser(userId: string, title: string, body: string) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { userId, title, body },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
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

// ─── Broadcast push / in-app (via Supabase Edge Function) ────────────────────

export async function broadcastPush(
  target: 'all' | 'workers' | 'employers' | 'metro',
  title: string,
  body: string,
  metro?: string,
) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { target, title, body, metro, mode: 'push' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return (data?.pushCount ?? 0) as number
}

export async function broadcastInApp(
  target: 'all' | 'workers' | 'employers',
  title: string,
  body: string,
) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { target, title, body, mode: 'inapp' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  logActivity('In-app уведомление', `Цель: ${target}, заголовок: "${title}", получателей: ${data?.inappCount ?? 0}`)
  return (data?.inappCount ?? 0) as number
}

export async function sendInAppToUser(userId: string, title: string, body: string) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { userId, title, body, mode: 'inapp' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  logActivity('In-app уведомление', `Адресат: ${userId}, заголовок: "${title}"`, userId)
  await trySendWebPushToUser(userId, title, body)
}

async function trySendWebPushToUser(userId: string, title: string, body: string) {
  try {
    const { data: sub } = await supabaseAdmin
      .from('jm_web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
      .maybeSingle()
    if (!sub) return
    await fetch('/api/webpush/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': process.env.NEXT_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6',
      },
      body: JSON.stringify({
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        title, body,
      }),
    })
  } catch { /* never crash due to web push failure */ }
}

export async function broadcastBoth(
  target: 'all' | 'workers' | 'employers' | 'metro',
  title: string,
  body: string,
  metro?: string,
) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { target, title, body, metro, mode: 'both' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  logActivity('Рассылка (push+inapp)', `Цель: ${target}, заголовок: "${title}", push: ${data?.pushCount ?? 0}, inapp: ${data?.inappCount ?? 0}`)
  return { pushCount: (data?.pushCount ?? 0) as number, inappCount: (data?.inappCount ?? 0) as number }
}

export async function broadcastWebPush(title: string, body: string): Promise<{ sent: number; failed: number }> {
  const res = await fetch('/api/webpush/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': process.env.NEXT_PUBLIC_APP_SECRET || 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6',
    },
    body: JSON.stringify({ title, body }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error ?? 'Ошибка web push рассылки')
  logActivity('Web Push рассылка (iPhone)', `Заголовок: "${title}", отправлено: ${data.sent}`)
  return { sent: data.sent as number, failed: data.failed as number }
}

export async function sendBothToUser(userId: string, title: string, body: string) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { userId, title, body, mode: 'both' },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  logActivity('Уведомление пользователю', `Адресат: ${userId}, заголовок: "${title}"`, userId)
  await trySendWebPushToUser(userId, title, body)
  return { pushCount: (data?.pushCount ?? 0) as number, inappCount: (data?.inappCount ?? 0) as number }
}

// ─── Vacancy editing ─────────────────────────────────────────────────────────

export async function updateTempVacancy(id: string, fields: {
  status?: 'open' | 'closed'
  is_urgent?: boolean
  salary?: number | null
  workers_needed?: number | null
  address?: string
  metro_station?: string
  date?: string
  time_start?: string
  time_end?: string
}) {
  const { error } = await supabaseAdmin.from('jm_vacancies').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
  logActivity('Вакансия (врем.) обновлена', `ID: ${id}, поля: ${Object.keys(fields).join(', ')}`)
}

export async function updatePermVacancy(id: string, fields: {
  status?: 'open' | 'closed'
  title?: string
  salary?: number | null
  address?: string
  metro_station?: string
  schedule?: string
  description?: string
}) {
  const { error } = await supabaseAdmin.from('jm_perm_vacancies').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
  logActivity('Вакансия (пост.) обновлена', `ID: ${id}, поля: ${Object.keys(fields).join(', ')}`)
}

// ─── Tickets (complaints) ─────────────────────────────────────────────────────

export async function addComplaintNote(complaintId: string, note: string) {
  const { error } = await supabaseAdmin
    .from('jm_complaints')
    .update({ admin_note: note } as any)
    .eq('id', complaintId)
  if (error) throw new Error(error.message)
  logActivity('Заметка к жалобе', `ID: ${complaintId}`)
}

export async function setComplaintStatus(id: string, status: 'pending' | 'in_review' | 'resolved' | 'dismissed') {
  const { error } = await supabaseAdmin
    .from('jm_complaints')
    .update({ status } as any)
    .eq('id', id)
  if (error) throw new Error(error.message)
  logActivity('Статус жалобы изменён', `ID: ${id} → ${status}`)
}
