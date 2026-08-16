'use client'
import { useCallback } from 'react'
import { fetchFunnel, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { AXIS, GRID, TT } from '@/lib/chart'


function FunnelBar({ items }: { items: { name: string; value: number; fill: string }[] }) {
  const max = items[0]?.value || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6 }}>
      {items.map((item, i) => {
        const pct = (item.value / max) * 100
        const convPct = i > 0 && items[i - 1].value > 0
          ? ((item.value / items[i - 1].value) * 100).toFixed(0) : null
        return (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-2)', width: 150, flexShrink: 0 }}>{item.name}</span>
            <div style={{ flex: 1, height: 28, background: 'var(--bg-sunken)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(pct, 2)}%`, height: '100%',
                background: item.fill, borderRadius: 5,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
                transition: 'width .3s ease',
              }}>
                <span style={{ color: '#fff', fontSize: 11, fontFamily: 'Geist Mono, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {item.value.toLocaleString('ru')}
                </span>
              </div>
            </div>
            {convPct !== null && (
              <span style={{ fontSize: 11, color: 'var(--ink-4)', width: 48, textAlign: 'right', fontFamily: 'Geist Mono, monospace', flexShrink: 0 }}>
                →{convPct}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function FunnelPage() {
  const fetcher = useCallback(() => fetchFunnel(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_likes', 'jm_users', 'jm_perm_applications'],
    intervalSec: 60,
  })

  if (loading || !d) return <Loader />

  return (
    <div>
      <PageHeader title="Воронка конверсии" intervalSec={60} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        {/* Активация */}
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-4)', fontWeight: 500, paddingBottom: 2 }}>
          Активация
        </div>
        <div className="g-4">
          <KpiCard label="Воркеров всего" value={d.kpi.workers} sparkColor={PALETTE.blue} />
          <KpiCard label="Лайкнули хоть раз" value={d.kpi.activatedWorkers} sparkColor={PALETTE.cyan} />
          <KpiCard label="% активации" value={`${d.kpi.activationRate}%`} sparkColor={PALETTE.cyan} />
          <KpiCard label="% активны в 7 дней" value={`${d.kpi.activation7d}%`} sparkColor={PALETTE.purple} />
        </div>

        {/* Конверсия */}
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-4)', fontWeight: 500, paddingBottom: 2, paddingTop: 4 }}>
          Конверсия
        </div>
        <div className="g-4">
          <KpiCard label="Всего лайков" value={d.kpi.totalLikes} sparkColor={PALETTE.pink} />
          <KpiCard label="Матчей" value={d.kpi.totalMatches} sparkColor={PALETTE.purple} />
          <KpiCard label="% лайк → матч" value={`${d.kpi.matchRate}%`} sparkColor={PALETTE.purple} />
          <KpiCard label="% матч → смена" value={`${d.kpi.completionRate}%`} sparkColor={PALETTE.green} />
        </div>

        {/* Удержание */}
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-4)', fontWeight: 500, paddingBottom: 2, paddingTop: 4 }}>
          Удержание
        </div>
        <div className="g-4">
          <KpiCard label="Смен завершено" value={d.kpi.completedCount} sparkColor={PALETTE.green} />
          <KpiCard label="Ср. смен/воркер" value={d.kpi.avgShiftsPerWorker} sparkColor={PALETTE.orange} />
          <KpiCard label="Вернулись (2+ смен)" value={d.kpi.returningWorkers} sparkColor={PALETTE.orange} />
          <KpiCard label="% повторных" value={`${d.kpi.returningRate}%`} sparkColor={PALETTE.amber} />
        </div>

        {/* Воронки */}
        <div className="g-2">
          <ChartCard title="Воронка по воркерам" sub="Уникальные пользователи на каждом шаге">
            <FunnelBar items={d.mainFunnel} />
          </ChartCard>

          <ChartCard title="Событийная воронка" sub="Всего событий на каждом шаге">
            <FunnelBar items={d.eventFunnel} />
          </ChartCard>
        </div>

        {/* Тренд 30 дней */}
        <ChartCard title="Динамика воронки" sub="30 дней — лайки, матчи, завершённые смены">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d.daily30} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gFL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.18} /><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.purple} stopOpacity={0.18} /><stop offset="95%" stopColor={PALETTE.purple} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.green} stopOpacity={0.18} /><stop offset="95%" stopColor={PALETTE.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT}
                formatter={(v: any, name: string) => [v, name === 'likes' ? 'Лайки' : name === 'matches' ? 'Матчи' : 'Смены']} />
              <Area type="monotone" dataKey="likes" stroke={PALETTE.blue} fill="url(#gFL)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="matches" stroke={PALETTE.purple} fill="url(#gFM)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="completed" stroke={PALETTE.green} fill="url(#gFC)" strokeWidth={1.7} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="g-2">
          {/* Активность воркеров */}
          <ChartCard title="Распределение активности" sub="Сколько лайков сделал каждый воркер">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.activityBuckets} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} formatter={(v: any) => [v, 'Воркеров']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {d.activityBuckets.map((e, i) => (
                    <Cell key={i} fill={i === 0 ? PALETTE.gray : i === 1 ? PALETTE.amber : i <= 3 ? PALETTE.orange : PALETTE.green} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Смены по воркерам */}
          <ChartCard title="Смены по воркерам" sub="Сколько смен завершил каждый воркер">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.shiftBuckets} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} formatter={(v: any) => [v, 'Воркеров']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {d.shiftBuckets.map((e, i) => (
                    <Cell key={i} fill={[PALETTE.amber, PALETTE.orange, PALETTE.cyan, PALETTE.green][i] ?? PALETTE.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Постоянные вакансии */}
        <ChartCard title="Постоянные вакансии — воронка заявок" sub="Подано → Одобрено / Отклонено">
          <FunnelBar items={d.permFunnel} />
          <div style={{ marginTop: 16, display: 'flex', gap: 32, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>% одобрения</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: PALETTE.green, fontFamily: 'Geist Mono, monospace' }}>
                {d.kpi.permApplications > 0
                  ? ((d.kpi.permApproved / d.kpi.permApplications) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Всего заявок</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Geist Mono, monospace' }}>
                {d.kpi.permApplications.toLocaleString('ru')}
              </div>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: 100, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
