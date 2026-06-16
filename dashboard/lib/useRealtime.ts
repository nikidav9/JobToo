'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'

interface Options {
  tables: string[]
  intervalSec?: number
}

export function useRealtime<T>(
  fetcher: () => Promise<T>,
  { tables, intervalSec = 60 }: Options
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState('')
  const [pulse, setPulse] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await fetcher()
      setData(result)
      setError(null)
      setLastUpdated(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setPulse(true)
      setTimeout(() => setPulse(false), 1500)
    } catch (e: any) {
      console.error('[useRealtime] fetch error:', e)
      setError(e?.message ?? 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    refresh()
    timerRef.current = setInterval(() => refresh(true), intervalSec * 1000)
    const channels = tables.map(table =>
      supabase
        .channel(`realtime:${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          refresh(true)
        })
        .subscribe()
    )
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, lastUpdated, pulse, refresh: () => refresh() }
}
