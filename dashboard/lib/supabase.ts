import { createClient } from '@supabase/supabase-js'
import { adminFetch, SUPABASE_STUB_URL } from './adminApi'

// Клиент никуда напрямую не ходит. Адрес здесь подставной, а весь обмен
// перехватывает adminFetch и уводит на php-proxy/admin.php — там проверяется
// токен и лежит сервисный ключ. В браузер ключи от базы больше не попадают,
// поэтому все 108 мест чтения и записи остались как были: меняется только
// то, куда уходит запрос.
export const supabase = createClient(SUPABASE_STUB_URL, 'proxied', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: adminFetch },
})

// Имя сохранено, чтобы не переписывать десятки мест. Прав у него ровно
// столько, сколько даёт токен админа, — отдельного клиента с особыми
// правами больше нет.
export const supabaseAdmin = supabase
