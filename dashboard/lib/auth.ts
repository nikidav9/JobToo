const KEY = 'jm_admin_auth'
const PWD_KEY = 'jm_admin_pwd'

export function setAuth(password?: string) {
  try {
    localStorage.setItem(KEY, '1')
    if (password) localStorage.setItem(PWD_KEY, password)
  } catch {}
}
export function clearAuth() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(PWD_KEY)
  } catch {}
}
export function isAuthed(): boolean {
  if (typeof window === 'undefined') return false
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
export function getStoredPassword(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(PWD_KEY) ?? '' } catch { return '' }
}
