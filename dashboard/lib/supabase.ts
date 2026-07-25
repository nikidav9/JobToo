import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// Только публичный ключ. Service-role ключ раньше уезжал в браузер вместе
// с бандлом и обходил все политики доступа — любой посетитель мог достать
// его из исходников страницы. Все изменения теперь идут через
// lib/adminApi.ts на сервер, где ключ и остаётся.
export const supabase = createClient(url, anonKey)

// Имя сохранено, чтобы не переписывать десятки мест чтения: это тот же
// публичный клиент, никаких дополнительных прав у него нет.
export const supabaseAdmin = supabase
