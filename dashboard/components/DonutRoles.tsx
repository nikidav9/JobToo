'use client'
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

/**
 * Кольцо «работники / работодатели».
 *
 * Было в двух местах и в обоих ломалось одинаково: кольцо рисовалось в
 * контейнере высотой 100–140 px, а подписи Recharts клал внутрь того же
 * контейнера. Им не хватало места, и они наезжали на само кольцо — числа
 * читались поверх заливки, то есть не читались вовсе.
 *
 * Здесь подписи вынесены под кольцо обычной разметкой: место под них
 * посчитано, а не выпрошено. В середине — общее число, чтобы доли было с чем
 * соотносить: «281» без «из 420» не значит ничего.
 *
 * Цвета берутся из тех же переменных, что и весь остальной интерфейс.
 * Recharts принимает только готовые значения, поэтому читаем их со страницы
 * один раз при появлении — иначе в системе появилась бы вторая палитра,
 * живущая своей жизнью.
 */

type Props = {
  workers: number
  employers: number
}

function useTokens(names: string[]): string[] {
  const [vals, setVals] = useState<string[]>(() => names.map(() => 'transparent'))
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    setVals(names.map(n => cs.getPropertyValue(n).trim() || 'transparent'))
    // Читаем один раз: тема не переключается, а слушать смену переменных
    // ради несуществующего события — лишняя работа на каждом кадре.
  }, [names.join(',')])
  return vals
}

export default function DonutRoles({ workers, employers }: Props) {
  const [accent, info, ink, ink3] = useTokens(['--accent', '--info', '--ink', '--ink-3'])
  const total = workers + employers
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  const rows = [
    { name: 'Работники', value: workers, color: accent },
    { name: 'Работодатели', value: employers, color: info },
  ]

  return (
    <div>
      <div style={{ position: 'relative', height: 168 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              cx="50%" cy="50%"
              innerRadius={54} outerRadius={74}
              dataKey="value"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {rows.map(r => <Cell key={r.name} fill={r.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Общее число в середине. Кольцо показывает доли, а доля без целого
            не читается: «две трети» от чего? */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'grid', placeItems: 'center', pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{
              fontSize: 26, fontWeight: 620, letterSpacing: '-0.02em', color: ink, lineHeight: 1.05,
            }}>{total.toLocaleString('ru-RU')}</div>
            <div style={{ fontSize: 12, color: ink3, marginTop: 2 }}>всего</div>
          </div>
        </div>
      </div>

      {/* Подписи под кольцом, а не поверх него. */}
      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {rows.map(r => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0,
            }} />
            <span style={{ color: 'var(--ink-2)' }}>{r.name}</span>
            <span className="num" style={{ marginLeft: 'auto', color: 'var(--ink)', fontWeight: 550 }}>
              {r.value.toLocaleString('ru-RU')}
            </span>
            <span className="num" style={{ color: 'var(--ink-3)', width: 40, textAlign: 'right' }}>
              {pct(r.value)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
