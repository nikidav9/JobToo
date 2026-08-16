'use client'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

/**
 * Кольцо с долями.
 *
 * Recharts кладёт свою легенду внутрь того же контейнера, что и само кольцо.
 * Пока контейнер высотой 160 px, подписям места не остаётся, и они наезжают
 * на заливку — числа читаются поверх цвета, то есть не читаются. Ровно на это
 * и жаловались.
 *
 * Здесь подписи — обычная разметка под кольцом: место под них посчитано, а не
 * выпрошено. В середине общее число, потому что доля без целого ничего не
 * говорит: «две трети» от чего?
 */

export type Slice = { name: string; value: number; color: string }

export default function Donut({ data, caption, height = 168 }: {
  data: Slice[]
  /** Подпись под общим числом в середине: «всего», «жалоб», «заявок». */
  caption?: string
  height?: number
}) {
  const total = data.reduce((s, x) => s + x.value, 0)
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  // Recharts не умеет рисовать кольцо из одних нулей — при пустых данных оно
  // просто исчезает, и остаётся дыра без объяснения.
  if (total === 0) {
    return (
      <div style={{ height, display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        Пока пусто
      </div>
    )
  }

  const r = Math.round(height * 0.44)

  return (
    <div>
      <div style={{ position: 'relative', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius={r - 20} outerRadius={r}
              dataKey="value"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map(s => <Cell key={s.name} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="num" style={{
              fontSize: 26, fontWeight: 620, letterSpacing: '-0.02em',
              color: 'var(--ink)', lineHeight: 1.05,
            }}>{total.toLocaleString('ru-RU')}</div>
            {caption && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{caption}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {data.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0,
            }} />
            <span style={{ color: 'var(--ink-2)' }}>{s.name}</span>
            <span className="num" style={{ marginLeft: 'auto', color: 'var(--ink)', fontWeight: 550 }}>
              {s.value.toLocaleString('ru-RU')}
            </span>
            <span className="num" style={{ color: 'var(--ink-3)', width: 40, textAlign: 'right' }}>
              {pct(s.value)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
