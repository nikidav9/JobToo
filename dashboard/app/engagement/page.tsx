'use client'
import { useCallback } from 'react'
import { fetchEngagement, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

export default function EngagementPage() {
  const fetcher = useCallback(() => fetchEngagement(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_chats', 'jm_messages'],
    intervalSec: 30,
  })

  if (loading || !d) return <Loader />

  return (
    <div>
      <PageHeader title="Активность" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-3">
          <KpiCard label="Всего чатов" value={d.kpi.totalChats} sparkColor={PALETTE.cyan} />
          <KpiCard label="Сообщений" value={d.kpi.totalMessages} sparkColor={PALETTE.blue} />
          <KpiCard label="Ср. сообщ./чат" value={d.kpi.avgMsgPerChat} sparkColor={PALETTE.purple} />
        </div>
        <div className="g-3">
          <KpiCard label="Чатов за 7 дней" value={d.kpi.activeChats} deltaTone="pos" delta={`+${d.kpi.activeChats}`} />
          <KpiCard label="Непрочит. (рабочие)" value={d.kpi.unreadWorker} sparkColor={PALETTE.orange} />
          <KpiCard label="Непрочит. (работод.)" value={d.kpi.unreadEmployer} sparkColor={PALETTE.blue} />
        </div>

        <div className="g-2">
          <ChartCard title="Сообщения по дням" sub="90 дней">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.daily90} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gMsg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={8} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Area type="monotone" dataKey="messages" name="Сообщения" stroke={PALETTE.blue} fill="url(#gMsg)" strokeWidth={1.7} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Новые чаты по дням" sub="90 дней">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.daily90} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCht" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.cyan} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={8} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Area type="monotone" dataKey="chats" name="Чаты" stroke={PALETTE.cyan} fill="url(#gCht)" strokeWidth={1.7} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="g-2">
          <ChartCard title="Распределение сообщений" sub="Сколько сообщений в каждом чате">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.msgDist} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Чатов" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, fill: '#6B6760' }}>
                  {d.msgDist.map((_, i) => <Cell key={i} fill={Object.values(PALETTE)[i % 8]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Сообщения и чаты" sub="Последние 30 дней">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.daily90.slice(-30)} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gMsg2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCht2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.cyan} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                <Area type="monotone" dataKey="messages" name="Сообщения" stroke={PALETTE.blue} fill="url(#gMsg2)" strokeWidth={1.7} dot={false} />
                <Area type="monotone" dataKey="chats" name="Чаты" stroke={PALETTE.cyan} fill="url(#gCht2)" strokeWidth={1.7} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ height: 120, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
