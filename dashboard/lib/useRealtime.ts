'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface Options {
  // Осталось от подписок на изменения: вызовов два десятка, ломать их
  // ради снятого поля незачем. Сейчас ни на что не влияет.
  tables?: string[]
  intervalSec?: number
}

export function useRealtime<T>(
  fetcher: () => Promise<T>,
  { intervalSec = 60 }: Options
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
    // Подписок на изменения больше нет. Дашборд ходит в базу через прокси,
    // а тот работает по обычному HTTP — websocket сквозь него не пройдёт.
    // Держится всё на опросе: раз в минуту по умолчанию, и кнопка
    // «обновить» под рукой. Для админки этого достаточно.
    refresh()
    timerRef.current = setInterval(() => refresh(true), intervalSec * 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, lastUpdated, pulse, refresh: () => refresh() }
}
