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
    const { target, title, body, metro, userId } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let tokens: string[] = []

    if (userId) {
      // Single user push
      const { data } = await supabase
        .from('jm_users')
        .select('push_token')
        .eq('id', userId)
        .maybeSingle()
      if (!data?.push_token) {
        return new Response(
          JSON.stringify({ error: 'У пользователя нет push-токена' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      tokens = [data.push_token]
    } else {
      // Broadcast
      let query = supabase.from('jm_users').select('push_token').not('push_token', 'is', null)
      if (target === 'workers') query = query.eq('role', 'worker')
      else if (target === 'employers') query = query.eq('role', 'employer')
      else if (target === 'metro' && metro) query = query.eq('metro_station', metro)

      const { data, error } = await query
      if (error) throw new Error(error.message)
      tokens = (data ?? []).map((u: any) => u.push_token).filter(Boolean)
      if (tokens.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Нет пользователей с push-токеном' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const messages = tokens.map((to) => ({
      to, title, body, sound: 'default', channelId: 'default', priority: 'high',
      data: { type: 'broadcast' },
    }))

    // Send in batches of 100
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100)
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch.length === 1 ? batch[0] : batch),
      })
      if (!res.ok) throw new Error(`Expo API error: ${res.status}`)
    }

    return new Response(
      JSON.stringify({ count: tokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
