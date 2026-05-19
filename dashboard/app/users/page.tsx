'use client'
import { useCallback } from 'react'
import { fetchUsers, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

function initials(name: string, phone: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return phone.slice(-2)
}

export default function UsersPage() {
  const fetcher = useCallback(() => fetchUsers(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users'],
    intervalSec: 30,
  })

  if (loading || !d) return <Loader />

  const workerPct = Math.round(d.kpi.workers / Math.max(d.kpi.total, 1) * 100)

  return (
    <div>
      <PageHeader title="Пользователи" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">

        {/* KPI row */}
        <div className="g-6">
          <KpiCard label="Всего" value={d.kpi.total} />
          <KpiCard label="Работники" value={d.kpi.workers} sub={`${workerPct}% базы`} sparkColor={PALETTE.orange} />
          <KpiCard label="Работодатели" value={d.kpi.employers} sub={`${100 - workerPct}% базы`} sparkColor={PALETTE.blue} />
          <KpiCard label="Заблокировано" value={d.kpi.blocked} sparkColor={PALETTE.red} />
          <KpiCard label="Новых · 7 дней" value={d.kpi.newWeek} deltaTone="pos" delta={`+${d.kpi.newWeek}`} />
          <KpiCard label="Новых · 30 дней" value={d.kpi.newMonth} deltaTone="pos" delta={`+${d.kpi.newMonth}`} />
        </div>

        {/* Charts row */}
        <div className="g-14">
          <ChartCard title="Новые регистрации" sub="Работники vs работодатели · 90 дней">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.growth90} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gW2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gE2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={8} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                <Area type="monotone" dataKey="workers" name="Работники" stroke={PALETTE.orange} fill="url(#gW2)" strokeWidth={1.7} dot={false} />
                <Area type="monotone" dataKey="employers" name="Работодатели" stroke={PALETTE.blue} fill="url(#gE2)" strokeWidth={1.7} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ChartCard title="Соотношение ролей" sub={`${d.kpi.total} пользователей`}>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={[
                    { name: 'Работники', value: d.kpi.workers },
                    { name: 'Работодатели', value: d.kpi.employers },
                  ]} cx="50%" cy="50%" innerRadius={42} outerRadius={60} dataKey="value" paddingAngle={3}>
                    <Cell fill={PALETTE.orange} />
                    <Cell fill={PALETTE.blue} />
                  </Pie>
                  <Tooltip contentStyle={TT} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        {/* Metro bar */}
        <ChartCard title="Топ станций метро" sub="Работники и работодатели">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.metroTop.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="station" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={120} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
              <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Users table — full info */}
        {d.recent.length > 0 && (
          <ChartCard title="Последние регистрации" sub={`Показаны последние ${d.recent.length} · обновляется в реальном времени`}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Пользователь', 'Роль', 'Метро / Локация', 'Компания', 'Статус', 'Дата регистрации'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500,
                      padding: '8px 12px 10px', background: 'var(--bg)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.recent.map((u: any, i: number) => {
                  const isWorker = u.role === 'worker'
                  const displayName = u.name || '—'
                  const ini = initials(u.name || '', u.phone || '')
                  return (
                    <tr key={i}
                      style={{ borderBottom: '1px solid var(--line)', transition: 'background .1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunken)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>

                      {/* Name + phone */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            background: isWorker
                              ? 'linear-gradient(135deg, #C8501E, #7D2D0E)'
                              : 'linear-gradient(135deg, #3B5BB5, #1F3A8A)',
                            display: 'grid', placeItems: 'center',
                            color: '#fff', fontWeight: 600, fontSize: 11,
                            letterSpacing: '-0.01em',
                          }}>{ini}</div>
                          <div>
                            <div style={{ fontWeight: 550, color: 'var(--ink)', fontSize: 13, lineHeight: 1.2 }}>
                              {displayName !== '—' ? displayName : <span style={{ color: 'var(--ink-3)' }}>Имя не указано</span>}
                            </div>
                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                              {u.phone || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 500,
                          color: isWorker ? 'var(--accent)' : 'var(--info)',
                          background: isWorker ? 'var(--accent-soft)' : 'rgba(59,91,181,.08)',
                          border: `1px solid ${isWorker ? 'var(--accent-line)' : 'rgba(59,91,181,.18)'}`,
                        }}>
                          {isWorker ? 'Работник' : 'Работодатель'}
                        </span>
                      </td>

                      {/* Metro */}
                      <td style={{ padding: '10px 12px' }}>
                        {u.metro && u.metro !== '—'
                          ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink-3)', flexShrink: 0, display: 'inline-block' }} />
                              <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{u.metro}</span>
                            </div>
                          : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                      </td>

                      {/* Company */}
                      <td style={{ padding: '10px 12px', color: u.company && u.company !== '—' ? 'var(--ink-2)' : 'var(--ink-4)', maxWidth: 160 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.company || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 12px' }}>
                        {u.blocked
                          ? <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '2px 7px', borderRadius: 999, fontSize: 11.5,
                              color: 'var(--negative)',
                              background: 'rgba(179,60,42,.08)',
                              border: '1px solid rgba(179,60,42,.18)',
                            }}>Заблокирован</span>
                          : <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '2px 7px', borderRadius: 999, fontSize: 11.5,
                              color: 'var(--positive)',
                              background: 'rgba(46,125,84,.08)',
                              border: '1px solid rgba(46,125,84,.18)',
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--positive)', display: 'inline-block' }} />
                              Активен
                            </span>}
                      </td>

                      {/* Date */}
                      <td style={{ padding: '10px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-3)' }}>
                        {u.date || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ChartCard>
        )}
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 64 : 140, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
