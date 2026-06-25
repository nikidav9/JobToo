import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || anonKey

export const supabase = createClient(url, anonKey)

// Admin client — bypasses RLS. Admin dashboard only.
export const supabaseAdmin = createClient(url, serviceKey)
