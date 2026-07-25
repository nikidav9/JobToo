// Вход в дашборд.
//
// Раньше здесь лежал флажок в localStorage: поставил единицу — и ты внутри.
// Сервер об этом не знал, данные отдавались кому угодно, а рядом в открытом
// виде хранился сам пароль. Теперь признак входа — токен от
// php-proxy/admin.php: без него ни один запрос к базе не пройдёт, подделать
// его нельзя, и живёт он 12 часов.

import { adminLogin, clearToken, getToken, tokenAlive } from './adminApi'

const LEGACY_KEYS = ['jm_admin_auth', 'jm_admin_pwd']

// Подчищаем хвосты старой схемы, в том числе сохранённый пароль.
function dropLegacy() {
  try { LEGACY_KEYS.forEach(k => localStorage.removeItem(k)) } catch {}
}

export async function login(loginName: string, password: string): Promise<void> {
  await adminLogin(loginName, password)
  dropLegacy()
}

export function clearAuth() {
  clearToken()
  dropLegacy()
}

export function isAuthed(): boolean {
  if (typeof window === 'undefined') return false
  const ok = tokenAlive(getToken())
  if (!ok) dropLegacy()
  return ok
}
