// Единственная дверь дашборда в базу.
//
// Раньше браузер ходил в Supabase напрямую публичным ключом — то есть данные
// были доступны любому, кто знает адрес проекта. Теперь все запросы идут
// через php-proxy/admin.php: он проверяет токен и уже сам обращается к базе
// под сервисным ключом, который остаётся на сервере.
//
// Токен выдаётся на входе в обмен на логин и пароль и живёт 12 часов.

export const ADMIN_PROXY_URL =
  process.env.NEXT_PUBLIC_ADMIN_PROXY_URL || 'https://jobtoo.ru/api/admin.php'

// Адрес, с которого supabase-js собирает ссылки. Наружу не уходит: adminFetch
// отрезает эту часть и оставляет только путь вида /rest/v1/jm_users?...
export const SUPABASE_STUB_URL = 'https://db.jobtoo.local'

const TOKEN_KEY = 'jm_admin_token'

export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token) } catch {}
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
}

export function getToken(): string {
  if (typeof window === 'undefined') return ''
  try { return localStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' }
}

// Срок годности зашит в сам токен (v1.<unix-время>.<подпись>). Читаем его,
// чтобы не гонять пользователя на страницы, которые всё равно ответят 401.
// Подпись здесь не проверяем — это забота сервера, подделка ему не пройдёт.
export function tokenAlive(token = getToken()): boolean {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return false
  const exp = Number(parts[1])
  return Number.isFinite(exp) && exp * 1000 > Date.now()
}

function basePath() {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.includes('/JobToo') ? '/JobToo' : ''
}

export async function adminLogin(login: string, password: string): Promise<void> {
  const res = await fetch(`${ADMIN_PROXY_URL}?action=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.token) {
    throw new Error(data?.error || 'Неверный логин или пароль')
  }
  setToken(data.token)
}

// fetch, который supabase-js использует вместо стандартного.
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw =
    typeof input === 'string' ? input :
    input instanceof URL ? input.toString() :
    (input as Request).url

  const path = raw.startsWith(SUPABASE_STUB_URL) ? raw.slice(SUPABASE_STUB_URL.length) : raw

  const headers = new Headers(init?.headers)
  // Ключи от Supabase здесь ни к чему: прокси подставит свой.
  headers.delete('apikey')
  headers.delete('Authorization')
  const token = getToken()
  if (token) headers.set('X-Admin-Token', token)

  const res = await fetch(`${ADMIN_PROXY_URL}?path=${encodeURIComponent(path)}`, {
    ...init,
    headers,
  })

  // Токен протух или отозван — уводим на вход, но только если он вообще был:
  // иначе со страницы входа получится петля.
  if (res.status === 401 && token && typeof window !== 'undefined') {
    clearToken()
    if (!window.location.pathname.endsWith('/login')) {
      window.location.replace(basePath() + '/login')
    }
  }

  return res
}
