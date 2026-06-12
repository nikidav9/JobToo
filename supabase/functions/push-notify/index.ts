import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { target, title, body, metro, userId, mode } = await req.json()
    // mode: 'push' (Expo push, default) | 'inapp' (jm_notifications) | 'both'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Resolve target user IDs / push tokens ─────────────────────────────────
    let userIds: string[] = []
    let tokens: string[] = []

    if (userId) {
      // Single user
      const { data } = await supabase
        .from('jm_users')
        .select('id, push_token')
        .eq('id', userId)
        .maybeSingle()
      if (data) {
        userIds = [data.id]
        if (data.push_token) tokens = [data.push_token]
      }
    } else {
      // Broadcast — filter by role/metro, and by whether they have push token
      let query = supabase.from('jm_users').select('id, push_token')
      if (target === 'workers') query = query.eq('role', 'worker')
      else if (target === 'employers') query = query.eq('role', 'employer')
      else if (target === 'metro' && metro) query = query.eq('metro_station', metro)

      // For push-only mode filter to users WITH token; inapp/both need all users
      if (!mode || mode === 'push') query = query.not('push_token', 'is', null)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      userIds = (data ?? []).map((u: any) => u.id)
      tokens = (data ?? []).map((u: any) => u.push_token).filter(Boolean)
    }

    if (userIds.length === 0 && tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Нет подходящих пользователей' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let pushCount = 0
    let inappCount = 0

    // ── Send Expo push notifications ──────────────────────────────────────────
    if (tokens.length > 0 && mode !== 'inapp') {
      const messages = tokens.map((to) => ({
        to, title, body, sound: 'default', channelId: 'default', priority: 'high',
        data: { type: 'broadcast' },
      }))

      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100)
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch.length === 1 ? batch[0] : batch),
        })
        if (!res.ok) throw new Error(`Expo API error: ${res.status}`)
        pushCount += batch.length
      }
    }

    // ── Save in-app notifications ─────────────────────────────────────────────
    if (userIds.length > 0 && (mode === 'inapp' || mode === 'both')) {
      const rows = userIds.map((uid) => ({ user_id: uid, title, body }))
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('jm_notifications').insert(rows.slice(i, i + 500))
        if (error) throw new Error(error.message)
        inappCount += rows.slice(i, i + 500).length
      }
    }

    return new Response(
      JSON.stringify({ pushCount, inappCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
