'use client'
import { useCallback } from 'react'
import { fetchMatching, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import PageSkeleton from '@/components/PageSkeleton'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { AXIS, AXIS_CAT, GRID, LEGEND, TT } from '@/lib/chart'


export default function MatchingPage() {
  const fetcher = useCallback(() => fetchMatching(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_likes'],
    intervalSec: 30,
  })

  if (loading || !d) return <PageSkeleton rows={2} />

  return (
    <div>
      <PageHeader title="Совпадения" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-4">
          <KpiCard label="Откликов" value={d.kpi.totalLikes} sub="лайки работников, без скипов" sparkColor={PALETTE.pink} />
          <KpiCard label="Совпадений" value={d.kpi.totalMatches}
            sub={`из ${d.kpi.totalLikes} откликов`} sparkColor={PALETTE.purple} />
          <KpiCard label="Отклик становится совпадением" value={`${d.kpi.matchRate}%`}
            sub="доля откликов" sparkColor={PALETTE.purple} />
          <KpiCard label="Завершено смен" value={d.kpi.completed}
            sub={`из ${d.kpi.totalMatches} совпадений`} sparkColor={PALETTE.green} />
        </div>

        <div className="g-4">
          <KpiCard label="Скипов" value={d.kpi.skipped} sub="свайпы «мимо», не отклики" sparkColor={PALETTE.gray} />
          <KpiCard label="Подтверждено обеими сторонами" value={d.kpi.confirmed}
            sub={`из ${d.kpi.totalMatches} совпадений`} sparkColor={PALETTE.orange} />
          <KpiCard label="Совпадение подтверждают" value={`${d.kpi.confirmRate}%`}
            sub="доля совпадений" sparkColor={PALETTE.orange} />
          <KpiCard label="Совпадение доходит до смены" value={`${d.kpi.completionRate}%`}
            sub="доля совпадений" sparkColor={PALETTE.green} />
        </div>

        <ChartCard title="Отклики и мэтчи по дням" sub="30 дней">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d.daily30} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gLk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.pink} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.pink} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gMt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.purple} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.purple} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND} />
              <Area type="monotone" dataKey="likes" name="Отклики" stroke={PALETTE.pink} fill="url(#gLk)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="matches" name="Совпадения" stroke={PALETTE.purple} fill="url(#gMt)" strokeWidth={1.7} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="g-2">
          <ChartCard title="Воронка совпадений" sub="От отклика до завершения смены · справа доля от предыдущего шага">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
              {d.funnel.map((item, i) => {
                const maxVal = d.funnel[0].value
                const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0
                const convPct = i > 0 && d.funnel[i - 1].value > 0
                  ? ((item.value / d.funnel[i - 1].value) * 100).toFixed(0) : null
                return (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)', width: 110, flexShrink: 0 }}>{item.name}</span>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg-sunken)', borderRadius: 5 }}>
                      <div style={{
                        width: `${Math.max(pct, item.value > 0 ? 2 : 0)}%`, height: '100%',
                        background: item.fill, borderRadius: 5,
                        transition: 'width var(--slow) var(--ease)',
                      }} />
                    </div>
                    <span className="num" style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 550, width: 56, textAlign: 'right', flexShrink: 0 }}>
                      {item.value.toLocaleString('ru-RU')}
                    </span>
                    {/* `convPct` — строка: «0» проходила как ложь, и шаг с нулевой
                        конверсией оставался вообще без подписи. */}
                    <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)', width: 48, textAlign: 'right', flexShrink: 0 }}>
                      {convPct !== null ? `${convPct}%` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </ChartCard>

          <ChartCard title="Конверсия по типам работ" sub="Лайки → Совпадения">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.matchByWorkType} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT}
                  formatter={(value: any, name: string) => [name === 'rate' ? `${value}%` : value, name === 'rate' ? 'Конверсия %' : name === 'likes' ? 'Лайки' : 'Совпадения']} />
                <Legend iconType="square" iconSize={8} wrapperStyle={LEGEND} />
                <Bar dataKey="likes" name="Отклики" fill={PALETTE.pink} opacity={0.7} radius={[4, 4, 0, 0]} />
                <Bar dataKey="matches" name="Совпадения" fill={PALETTE.purple} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="% конверсии по типам работ" sub="Доля лайков, ставших совпадениями">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={d.matchByWorkType} layout="vertical" margin={{ left: 8, right: 50, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={AXIS_CAT} tickLine={false} axisLine={false} width={80} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`${v}%`, 'Конверсия']} />
              <Bar dataKey="rate" name="Конверсия %" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'var(--ink-3)', formatter: (v: any) => `${v}%` }}>
                {d.matchByWorkType.map((e, i) => (
                  <Cell key={i} fill={e.rate > 50 ? PALETTE.green : e.rate > 25 ? PALETTE.amber : PALETTE.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

