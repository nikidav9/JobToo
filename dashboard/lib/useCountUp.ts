'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Докрутка числа при появлении и при изменении.
 *
 * Смысл не в украшении. Панель обновляется сама раз в 30–120 секунд, и когда
 * число молча меняется с 418 на 420, этого никто не замечает. Докрутка за
 * 600 мс — единственное движение, которое здесь разрешено без действия
 * пользователя, потому что его причина — новые данные.
 *
 * Дробные значения (рейтинг 4.37) сохраняют свою разрядность: считаем в целых
 * и делим обратно, иначе на промежуточных кадрах пляшет число знаков и строка
 * дёргается по ширине.
 */
export function useCountUp(target: number, decimals = 0, ms = 600): number {
  const [val, setVal] = useState(target)
  const from = useRef(target)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || !isFinite(target)) { setVal(target); from.current = target; return }

    const start = performance.now()
    const a = from.current
    const b = target
    if (a === b) return

    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      // Та же кривая, что и у всей панели: резкий старт, мягкая остановка.
      const e = 1 - Math.pow(1 - p, 3)
      const k = Math.pow(10, decimals)
      setVal(Math.round((a + (b - a) * e) * k) / k)
      if (p < 1) raf.current = requestAnimationFrame(step)
      else from.current = b
    }
    raf.current = requestAnimationFrame(step)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, decimals, ms])

  return val
}

/**
 * Разбор значения KPI.
 *
 * Карточки получают то число, то готовую строку («4.37», «12%», «2 ч 40 мин»).
 * Здесь решается, можно ли это докрутить: если строка — это число с
 * необязательным хвостом вроде «%», крутим число и возвращаем хвост на место.
 * Всё остальное показываем как есть — «2 ч 40 мин» докручивать нечего.
 */
export function parseKpi(value: string | number | null | undefined) {
  if (value === null || value === undefined) return { kind: 'empty' as const }
  if (typeof value === 'number') {
    return isFinite(value)
      ? { kind: 'num' as const, num: value, decimals: 0, suffix: '' }
      : { kind: 'empty' as const }
  }
  const m = /^(-?\d+(?:[.,]\d+)?)(\s*[%×]?)$/.exec(value.trim())
  if (!m) return { kind: 'text' as const, text: value }
  const raw = m[1].replace(',', '.')
  const dot = raw.indexOf('.')
  return {
    kind: 'num' as const,
    num: Number(raw),
    decimals: dot === -1 ? 0 : raw.length - dot - 1,
    suffix: m[2] ?? '',
  }
}
