'use client'
import { useCallback } from 'react'
import { fetchEngagement, fetchCohorts, PALETTE } from '@/lib/queries'
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

function retentionColor(pct: number | null) {
  if (pct === null) return 'transparent'
  if (pct === 0) return '#F5F4F0'
  if (pct >= 80) return '#1A6644'
  if (pct >= 60) return '#2E7D54'
  if (pct >= 40) return '#5BA07A'
  if (pct >= 20) return '#8EC4A7'
  return '#C4E0D3'
}

function retentionTextColor(pct: number | null) {
  if (pct === null || pct === 0) return 'var(--ink-4)'
  if (pct >= 40) return '#fff'
  return '#2E7D54'
}

export default function EngagementPage() {
  const fetcher = useCallback(() => fetchEngagement(), [])
  const { data: d, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_chats', 'jm_messages'],
    intervalSec: 30,
  })

  const cohortFetcher = useCallback(() => fetchCohorts(), [])
  const { data: cohorts } = useRealtime(cohortFetcher, { tables: ['jm_users', 'jm_likes', 'jm_messages'], intervalSec: 120 })

  if (loading) return <Loader />
  if (error || !d) return <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />

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
                  {d.msgDist.map((_: any, i: number) => <Cell key={i} fill={Object.values(PALETTE)[i % 8]} />)}
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

        {cohorts && (
          <>
            <ChartCard title="Новые пользователи по неделям" sub="Работники vs работодатели · 12 недель">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cohorts.weeklyBar} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TT} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                  <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
                  <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Когортный анализ" sub="Удержание пользователей по неделям регистрации · % активных (лайки / сообщения)">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 12px 6px 0', textAlign: 'left', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Неделя</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Регистраций</th>
                      {['Нед. 0', 'Нед. 1', 'Нед. 2', 'Нед. 3', 'Нед. 4'].map(w => (
                        <th key={w} style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{w}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.table.map((row: any, i: number) => (
                      <tr key={i}>
                        <td style={{ padding: '5px 12px 5px 0', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{row.label}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--ink)' }}>{row.size}</td>
                        {row.cols.map((pct: number | null, ci: number) => (
                          <td key={ci} style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <div style={{
                              minWidth: 48, padding: '4px 6px', borderRadius: 5,
                              background: retentionColor(pct),
                              color: retentionTextColor(pct),
                              fontSize: 11.5, fontWeight: 600,
                              display: 'inline-block',
                            }}>
                              {pct === null ? '' : pct === 0 && row.size === 0 ? '—' : `${pct}%`}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: 'var(--ink-4)' }}>
                <span>Легенда:</span>
                {[['80%+', '#1A6644'], ['60%+', '#2E7D54'], ['40%+', '#5BA07A'], ['20%+', '#8EC4A7'], ['&lt;20%', '#C4E0D3'], ['—', '#F5F4F0']].map(([l, c]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: c, display: 'inline-block' }} />
                    <span dangerouslySetInnerHTML={{ __html: l }} />
                  </span>
                ))}
              </div>
            </ChartCard>
          </>
        )}
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Не удалось загрузить данные</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'Geist Mono, monospace', maxWidth: 400, textAlign: 'center' }}>{message}</div>
      <button onClick={onRetry} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>
        Повторить
      </button>
    </div>
  )
}
