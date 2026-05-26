const KEY = 'jm_admin_auth'

export function setAuth() {
  try { localStorage.setItem(KEY, '1') } catch {}
}
export function clearAuth() {
  try { localStorage.removeItem(KEY) } catch {}
}
export function isAuthed(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
