'use client'
import { useCallback, useState } from 'react'
import { fetchUsers, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import { blockUser, resetPassword, sendPushToUser } from '@/lib/admin-actions'
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
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

type ActionState = 'idle' | 'loading' | 'ok' | 'err'

export default function UsersPage() {
  const fetcher = useCallback(() => fetchUsers(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users'], intervalSec: 30,
  })

  const [phoneSearch, setPhoneSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<string, { s: ActionState; msg?: string }>>({})
  const [pushText, setPushText] = useState<Record<string, string>>({})

  if (loading || !d) return <Loader />

  const workerPct = Math.round(d.kpi.workers / Math.max(d.kpi.total, 1) * 100)
  const filteredUsers = phoneSearch.trim()
    ? d.recent.filter((u: any) => (u.phone ?? '').includes(phoneSearch.trim()))
    : d.recent

  function setA(id: string, s: ActionState, msg?: string) {
    setActions(prev => ({ ...prev, [id]: { s, msg } }))
  }

  async function handleBlock(u: any) {
    setA(u.id, 'loading')
    try {
      await blockUser(u.id, !u.blocked)
      setA(u.id, 'ok', u.blocked ? 'Разблокирован' : 'Заблокирован')
      setTimeout(refresh, 800)
    } catch (e: any) { setA(u.id, 'err', e.message) }
  }

  async function handleResetPwd(u: any) {
    setA(u.id + '_pwd', 'loading')
    try {
      const pwd = await resetPassword(u.id)
      setA(u.id + '_pwd', 'ok', `Новый пароль: ${pwd}`)
    } catch (e: any) { setA(u.id + '_pwd', 'err', e.message) }
  }

  async function handlePush(u: any) {
    const text = pushText[u.id]?.trim()
    if (!text) return
    setA(u.id + '_push', 'loading')
    try {
      await sendPushToUser(u.id, '📢 Сообщение от администратора', text)
      setA(u.id + '_push', 'ok', 'Пуш отправлен')
      setPushText(prev => ({ ...prev, [u.id]: '' }))
    } catch (e: any) { setA(u.id + '_push', 'err', e.message) }
  }

  return (
    <div>
      <PageHeader title="Пользователи" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
      <div className="page-content">

        {/* KPI */}
        <div className="g-6">
          <KpiCard label="Всего" value={d.kpi.total} />
          <KpiCard label="Работники" value={d.kpi.workers} sub={`${workerPct}% базы`} sparkColor={PALETTE.orange} />
          <KpiCard label="Работодатели" value={d.kpi.employers} sub={`${100 - workerPct}% базы`} sparkColor={PALETTE.blue} />
          <KpiCard label="Заблокировано" value={d.kpi.blocked} sparkColor={PALETTE.red} />
          <KpiCard label="Новых · 7 дней" value={d.kpi.newWeek} deltaTone="pos" delta={`+${d.kpi.newWeek}`} />
          <KpiCard label="Новых · 30 дней" value={d.kpi.newMonth} deltaTone="pos" delta={`+${d.kpi.newMonth}`} />
        </div>

        {/* Charts */}
        <div className="g-14">
          <ChartCard title="Новые регистрации" sub="Работники vs работодатели · 90 дней">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.growth90} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gW2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.2}/><stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0}/></linearGradient>
                  <linearGradient id="gE2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2}/><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0}/></linearGradient>
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
          <ChartCard title="Соотношение ролей" sub={`${d.kpi.total} пользователей`}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={[{ name: 'Работники', value: d.kpi.workers }, { name: 'Работодатели', value: d.kpi.employers }]} cx="50%" cy="50%" innerRadius={42} outerRadius={60} dataKey="value" paddingAngle={3}>
                  <Cell fill={PALETTE.orange} /><Cell fill={PALETTE.blue} />
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
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

        {/* Users CRM table */}
        {d.recent.length > 0 && (
          <ChartCard
            title="Все пользователи"
            sub={phoneSearch.trim() ? `Найдено ${filteredUsers.length} из ${d.recent.length}` : `${d.recent.length} пользователей · CRM`}
          >
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Поиск по номеру телефона..."
                value={phoneSearch}
                onChange={e => setPhoneSearch(e.target.value)}
                style={{
                  width: '100%', maxWidth: 320, padding: '7px 12px',
                  border: '1px solid var(--line)', borderRadius: 8,
                  background: 'var(--bg-sunken)', color: 'var(--ink)',
                  fontSize: 13, outline: 'none', fontFamily: 'Geist Mono, monospace',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--line)')}
              />
            </div>

            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Пользователь', 'Роль', 'Метро', 'Компания', 'Статус', 'Дата', 'Действия'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500, padding: '8px 12px 10px', background: 'var(--bg)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0
                    ? <tr><td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Не найдено</td></tr>
                    : filteredUsers.map((u: any) => {
                        const isWorker = u.role === 'worker'
                        const ini = initials(u.name || '', u.phone || '')
                        const expanded = expandedId === u.id
                        const aBlock = actions[u.id]
                        const aPwd = actions[u.id + '_pwd']
                        const aPush = actions[u.id + '_push']

                        return (
                          <>
                            <tr key={u.id}
                              style={{ borderBottom: expanded ? 'none' : '1px solid var(--line)', background: expanded ? 'var(--bg-sunken)' : undefined, cursor: 'pointer' }}
                              onClick={() => setExpandedId(expanded ? null : u.id)}
                              onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunken)' }}
                              onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '' }}
                            >
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: isWorker ? 'linear-gradient(135deg,#C8501E,#7D2D0E)' : 'linear-gradient(135deg,#3B5BB5,#1F3A8A)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 600, fontSize: 11 }}>{ini}</div>
                                  <div>
                                    <div style={{ fontWeight: 550, color: u.blocked ? 'var(--negative)' : 'var(--ink)', fontSize: 13, lineHeight: 1.2 }}>
                                      {u.name || <span style={{ color: 'var(--ink-3)' }}>Имя не указано</span>}
                                    </div>
                                    <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{u.phone || '—'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 500, color: isWorker ? 'var(--accent)' : 'var(--info)', background: isWorker ? 'var(--accent-soft)' : 'rgba(59,91,181,.08)', border: `1px solid ${isWorker ? 'var(--accent-line)' : 'rgba(59,91,181,.18)'}` }}>
                                  {isWorker ? 'Работник' : 'Работодатель'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--ink-2)', fontSize: 12.5 }}>
                                {u.metro && u.metro !== '—' ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink-3)', display: 'inline-block', marginRight: 5 }} />{u.metro}</> : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                              </td>
                              <td style={{ padding: '10px 12px', color: u.company && u.company !== '—' ? 'var(--ink-2)' : 'var(--ink-4)', maxWidth: 140 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.company || '—'}</span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {u.blocked
                                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, fontSize: 11.5, color: 'var(--negative)', background: 'rgba(179,60,42,.08)', border: '1px solid rgba(179,60,42,.18)' }}>🚫 Заблокирован</span>
                                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, fontSize: 11.5, color: 'var(--positive)', background: 'rgba(46,125,84,.08)', border: '1px solid rgba(46,125,84,.18)' }}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--positive)', display: 'inline-block' }} />Активен
                                    </span>}
                              </td>
                              <td style={{ padding: '10px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-3)' }}>{u.date || '—'}</td>
                              <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 5 }}>
                                  {/* Block */}
                                  {aBlock?.s === 'ok'
                                    ? <span style={{ fontSize: 11.5, color: 'var(--positive)', fontWeight: 500 }}>{aBlock.msg}</span>
                                    : <button onClick={() => handleBlock(u)} disabled={aBlock?.s === 'loading'}
                                        style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--line)', background: u.blocked ? 'rgba(46,125,84,.08)' : 'rgba(179,60,42,.08)', color: u.blocked ? 'var(--positive)' : 'var(--negative)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        {aBlock?.s === 'loading' ? '…' : u.blocked ? 'Разблокировать' : 'Заблокировать'}
                                      </button>}

                                  {/* Expand toggle */}
                                  <button onClick={() => setExpandedId(expanded ? null : u.id)}
                                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-sunken)', color: 'var(--ink-3)', fontSize: 11.5, cursor: 'pointer' }}>
                                    {expanded ? '▲' : '▼'}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded CRM panel */}
                            {expanded && (
                              <tr key={u.id + '_exp'} style={{ borderBottom: '1px solid var(--line)' }}>
                                <td colSpan={7} style={{ padding: '0 12px 14px 60px', background: 'var(--bg-sunken)' }}>
                                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 10 }}>

                                    {/* Reset password */}
                                    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', minWidth: 200 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 8 }}>🔑 Сбросить пароль</div>
                                      {aPwd?.s === 'ok'
                                        ? <div style={{ fontSize: 13, color: 'var(--positive)' }}>
                                            <div style={{ fontWeight: 500, marginBottom: 2 }}>Новый пароль:</div>
                                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 18, fontWeight: 700, letterSpacing: 2, color: 'var(--ink)', background: 'var(--bg-sunken)', padding: '4px 10px', borderRadius: 6 }}>
                                              {aPwd.msg?.replace('Новый пароль: ', '')}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>Пуш-уведомление отправлено</div>
                                          </div>
                                        : aPwd?.s === 'err'
                                          ? <div style={{ fontSize: 12, color: 'var(--negative)' }}>{aPwd.msg}</div>
                                          : <button onClick={() => handleResetPwd(u)} disabled={aPwd?.s === 'loading'}
                                              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                                              {aPwd?.s === 'loading' ? 'Генерация…' : 'Сгенерировать новый'}
                                            </button>}
                                    </div>

                                    {/* Send push */}
                                    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', flex: 1, minWidth: 260 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 8 }}>📲 Отправить пуш</div>
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                          placeholder="Текст уведомления..."
                                          value={pushText[u.id] ?? ''}
                                          onChange={e => setPushText(prev => ({ ...prev, [u.id]: e.target.value }))}
                                          style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 12.5, outline: 'none' }}
                                        />
                                        <button onClick={() => handlePush(u)} disabled={!pushText[u.id]?.trim() || aPush?.s === 'loading'}
                                          style={{ padding: '0 12px', height: 32, borderRadius: 6, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
                                          {aPush?.s === 'loading' ? '…' : 'Отправить'}
                                        </button>
                                      </div>
                                      {aPush?.s === 'ok' && <div style={{ fontSize: 11.5, color: 'var(--positive)', marginTop: 5 }}>✓ {aPush.msg}</div>}
                                      {aPush?.s === 'err' && <div style={{ fontSize: 11.5, color: 'var(--negative)', marginTop: 5 }}>✗ {aPush.msg}</div>}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                </tbody>
              </table>
            </div>
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
