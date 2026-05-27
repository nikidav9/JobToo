'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from './supabase'

interface Options {
  tables: string[]          // таблицы для realtime подписки
  intervalSec?: number      // авто-обновление каждые N секунд (default 60)
}

export function useRealtime<T>(
  fetcher: () => Promise<T>,
  { tables, intervalSec = 60 }: Options
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState('')
  const [pulse, setPulse] = useState(false)   // мигание при новых данных
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const result = await fetcher()
    setData(result)
    setLastUpdated(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    setLoading(false)
    setPulse(true)
    setTimeout(() => setPulse(false), 1500)
  }, [fetcher])

  useEffect(() => {
    refresh()

    // авто-обновление по интервалу
    timerRef.current = setInterval(() => refresh(true), intervalSec * 1000)

    // Supabase Realtime подписки
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

  return { data, loading, lastUpdated, pulse, refresh: () => refresh() }
}
