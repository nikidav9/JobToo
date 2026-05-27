import { supabaseAdmin } from './supabase'
import { logActivity } from './activity-log'

// ─── Users ────────────────────────────────────────────────────────────────────

export async function blockUser(userId: string, block: boolean, userName?: string) {
  const { error } = await supabaseAdmin
    .from('jm_users')
    .update({ is_blocked: block })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  logActivity(block ? 'Заблокирован' : 'Разблокирован', `ID: ${userId}`, userId, userName)
}

export async function resetPassword(userId: string): Promise<string> {
  const newPassword = Math.random().toString(36).slice(2, 8).toUpperCase()
  const { error } = await supabaseAdmin
    .from('jm_users')
    .update({ password: newPassword })
    .eq('id', userId)
  if (error) throw new Error(error.message)

  await supabaseAdmin.functions.invoke('push-notify', {
    body: { userId, title: '🔑 Новый пароль', body: `Ваш новый пароль: ${newPassword}` },
  }).catch(() => {})
  return newPassword
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

// ─── Broadcast push (via Supabase Edge Function to avoid browser CORS) ───────

export async function broadcastPush(
  target: 'all' | 'workers' | 'employers' | 'metro',
  title: string,
  body: string,
  metro?: string,
) {
  const { data, error } = await supabaseAdmin.functions.invoke('push-notify', {
    body: { target, title, body, metro },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data?.count ?? 0
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

