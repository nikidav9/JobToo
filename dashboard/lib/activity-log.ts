export interface ActivityEntry {
  id: string
  ts: string
  action: string
  details: string
  userId?: string
  userName?: string
}

const KEY = 'crm_activity_log'
const MAX = 300

export function logActivity(action: string, details: string, userId?: string, userName?: string) {
  const entry: ActivityEntry = {
    id: Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
    action,
    details,
    userId,
    userName,
  }
  try {
    const existing = getActivityLog()
    localStorage.setItem(KEY, JSON.stringify([entry, ...existing].slice(0, MAX)))
  } catch {}
}

export function getActivityLog(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function clearActivityLog() {
  try { localStorage.removeItem(KEY) } catch {}
}
