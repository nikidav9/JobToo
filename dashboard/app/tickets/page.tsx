'use client'
import { useCallback, useState } from 'react'
import { supabaseAdmin } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import PageHeader from '@/components/PageHeader'
import { blockUser, setComplaintStatus, addComplaintNote } from '@/lib/admin-actions'
import { sendPushToUser } from '@/lib/admin-actions'

async function fetchTickets() {
  const [{ data: complaints }, { data: users }] = await Promise.all([
    supabaseAdmin.from('jm_complaints').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('jm_users').select('id,first_name,last_name,phone,role,is_blocked,push_token'),
  ])

  const userMap: Record<string, any> = {}
  for (const u of users ?? []) userMap[u.id] = u

  function uName(u: any) {
    if (!u) return '—'
    return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.phone || '—'
  }

  const list = (complaints ?? []).map((c: any) => ({
    id: c.id,
    type: c.complaint_type ?? 'other',
    description: c.description ?? '—',
    status: c.status ?? 'pending',
    adminNote: (c as any).admin_note ?? '',
    reporterId: c.reporter_id ?? null,
    targetId: c.target_id ?? null,
    reporterName: uName(userMap[c.reporter_id]),
    reporterPhone: c.reporter_phone ?? userMap[c.reporter_id]?.phone ?? '—',
    targetName: uName(userMap[c.target_id]),
    targetPhone: c.target_phone ?? userMap[c.target_id]?.phone ?? '—',
    targetBlocked: userMap[c.target_id]?.is_blocked ?? false,
    targetHasPush: !!userMap[c.target_id]?.push_token,
    reporterHasPush: !!userMap[c.reporter_id]?.push_token,
    date: c.created_at?.slice(0, 10) ?? '',
    time: c.created_at?.slice(11, 16) ?? '',
  }))

  return { list }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Новая',
  in_review: 'В работе',
  resolved: 'Решена',
  dismissed: 'Отклонена',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#A87020',
  in_review: '#3B5BB5',
  resolved: '#2E7D54',
  dismissed: '#9A9690',
}

type ActionSt = 'idle' | 'loading' | 'ok' | 'err'

export default function TicketsPage() {
  const fetcher = useCallback(() => fetchTickets(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_complaints', 'jm_users'],
    intervalSec: 30,
  })

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [actions, setActions] = useState<Record<string, { s: ActionSt; msg?: string }>>({})

  function setA(id: string, s: ActionSt, msg?: string) {
    setActions(prev => ({ ...prev, [id]: { s, msg } }))
  }

  if (loading || !d) return <Loader />

  const list = d.list.filter((c: any) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    return true
  })

  const pending = d.list.filter((c: any) => c.status === 'pending').length
  const inReview = d.list.filter((c: any) => c.status === 'in_review').length
  const resolved = d.list.filter((c: any) => c.status === 'resolved').length

  const types = Array.from(new Set(d.list.map((c: any) => c.type))) as string[]

  async function handleBlock(c: any) {
    if (!c.targetId) return
    setA(c.id + '_block', 'loading')
    try {
      await blockUser(c.targetId, !c.targetBlocked, c.targetName)
      setA(c.id + '_block', 'ok', c.targetBlocked ? 'Разблокирован' : 'Заблокирован')
      setTimeout(refresh, 800)
    } catch (e: any) { setA(c.id + '_block', 'err', e.message) }
  }

  async function handleStatus(c: any, status: 'pending' | 'in_review' | 'resolved' | 'dismissed') {
    setA(c.id + '_st', 'loading')
    try {
      await setComplaintStatus(c.id, status)
      setA(c.id + '_st', 'ok', STATUS_LABEL[status])
      setTimeout(refresh, 600)
    } catch (e: any) { setA(c.id + '_st', 'err', e.message) }
  }

  async function handleNote(c: any) {
    const note = noteText[c.id]?.trim()
    if (!note) return
    setA(c.id + '_note', 'loading')
    try {
      await addComplaintNote(c.id, note)
      setA(c.id + '_note', 'ok', 'Сохранено')
      setTimeout(refresh, 600)
    } catch (e: any) { setA(c.id + '_note', 'err', e.message) }
  }

  async function handlePushTarget(c: any) {
    if (!c.targetId) return
    setA(c.id + '_push', 'loading')
    try {
      await sendPushToUser(c.targetId, '⚠️ Жалоба', 'Ваш аккаунт рассматривается администрацией. Пожалуйста, соблюдайте правила сервиса.')
      setA(c.id + '_push', 'ok', 'Пуш отправлен')
    } catch (e: any) { setA(c.id + '_push', 'err', e.message) }
  }

  return (
    <div>
      <PageHeader title="Тикеты / Жалобы" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
      <div className="page-content">

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Всего', value: d.list.length, color: 'var(--ink)' },
            { label: 'Новых', value: pending, color: '#A87020' },
            { label: 'В работе', value: inReview, color: '#3B5BB5' },
            { label: 'Решено', value: resolved, color: '#2E7D54' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 16px', boxShadow: 'var(--shadow-sm)', minWidth: 100 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500 }}>Статус:</div>
          {['all', 'pending', 'in_review', 'resolved', 'dismissed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '4px 12px', borderRadius: 20, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: statusFilter === s ? 'var(--ink)' : 'var(--bg-sunken)',
              color: statusFilter === s ? '#fff' : 'var(--ink-2)',
            }}>
              {s === 'all' ? 'Все' : STATUS_LABEL[s]}
            </button>
          ))}
          {types.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 500, marginLeft: 8 }}>Тип:</div>
              {['all', ...types].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={{
                  padding: '4px 12px', borderRadius: 20, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: typeFilter === t ? 'var(--ink)' : 'var(--bg-sunken)',
                  color: typeFilter === t ? '#fff' : 'var(--ink-2)',
                }}>
                  {t === 'all' ? 'Все' : t}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Ticket list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              Тикеты не найдены
            </div>
          )}
          {list.map((c: any) => {
            const expanded = expandedId === c.id
            const statusColor = STATUS_COLOR[c.status] ?? '#6B6760'
            const aBlock = actions[c.id + '_block']
            const aSt = actions[c.id + '_st']
            const aNote = actions[c.id + '_note']
            const aPush = actions[c.id + '_push']

            return (
              <div key={c.id} style={{
                background: 'var(--bg-elev)', border: `1px solid ${c.status === 'pending' ? 'rgba(168,112,32,.35)' : 'var(--line)'}`,
                borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
              }}>
                {/* Card header */}
                <div
                  style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                >
                  {/* Status indicator */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: statusColor,
                    flexShrink: 0, marginTop: 5,
                    boxShadow: c.status === 'pending' ? `0 0 0 3px ${statusColor}25` : 'none',
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                        padding: '1px 7px', borderRadius: 4,
                        background: statusColor + '18', color: statusColor,
                        border: '1px solid ' + statusColor + '30',
                      }}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--ink-4)', background: 'var(--bg-sunken)', padding: '1px 7px', borderRadius: 4 }}>
                        {c.type}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace', marginLeft: 'auto' }}>
                        {c.date} {c.time}
                      </span>
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, marginBottom: 8 }}>
                      {c.description}
                    </div>

                    {/* Parties */}
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                      <span>
                        👤 От: <strong style={{ color: 'var(--ink)' }}>{c.reporterName}</strong>
                        <span style={{ fontFamily: 'Geist Mono, monospace', marginLeft: 4 }}>{c.reporterPhone}</span>
                      </span>
                      <span>
                        🎯 На: <strong style={{ color: c.targetBlocked ? 'var(--negative)' : 'var(--ink)' }}>{c.targetName}</strong>
                        <span style={{ fontFamily: 'Geist Mono, monospace', marginLeft: 4 }}>{c.targetPhone}</span>
                        {c.targetBlocked && <span style={{ marginLeft: 4, fontSize: 10.5, color: 'var(--negative)', fontWeight: 600 }}>БЛОК</span>}
                      </span>
                    </div>

                    {c.adminNote && (
                      <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(59,91,181,.06)', border: '1px solid rgba(59,91,181,.15)', fontSize: 12, color: '#3B5BB5' }}>
                        📝 {c.adminNote}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 11, color: 'var(--ink-4)', flexShrink: 0, marginTop: 2 }}>
                    {expanded ? '▲' : '▼'}
                  </span>
                </div>

                {/* Expanded actions */}
                {expanded && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px', background: 'var(--bg-sunken)', display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Status actions */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 8 }}>Изменить статус</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(['pending', 'in_review', 'resolved', 'dismissed'] as const).filter(s => s !== c.status).map(s => (
                          <button key={s} onClick={() => handleStatus(c, s)} disabled={aSt?.s === 'loading'}
                            style={{
                              padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (STATUS_COLOR[s] + '40'), cursor: 'pointer',
                              background: STATUS_COLOR[s] + '10', color: STATUS_COLOR[s], fontSize: 12, fontWeight: 500,
                            }}>
                            {aSt?.s === 'loading' ? '…' : STATUS_LABEL[s]}
                          </button>
                        ))}
                        {aSt?.s === 'ok' && <span style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 500 }}>✓ {aSt.msg}</span>}
                      </div>
                    </div>

                    {/* Target actions */}
                    {c.targetId && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 8 }}>Действия с обвиняемым</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {aBlock?.s === 'ok'
                            ? <span style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 500 }}>✓ {aBlock.msg}</span>
                            : <button onClick={() => handleBlock(c)} disabled={aBlock?.s === 'loading'}
                                style={{ padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                                  background: c.targetBlocked ? 'rgba(46,125,84,.1)' : 'rgba(179,60,42,.1)',
                                  color: c.targetBlocked ? 'var(--positive)' : 'var(--negative)' }}>
                                {aBlock?.s === 'loading' ? '…' : c.targetBlocked ? 'Разблокировать' : 'Заблокировать'}
                              </button>}

                          {c.targetHasPush && (
                            aPush?.s === 'ok'
                              ? <span style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 500 }}>✓ Пуш отправлен</span>
                              : <button onClick={() => handlePushTarget(c)} disabled={aPush?.s === 'loading'}
                                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: 'var(--bg-elev)', color: 'var(--ink-2)' }}>
                                  {aPush?.s === 'loading' ? '…' : '📲 Предупредить пушем'}
                                </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Admin note */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 8 }}>Заметка администратора</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          placeholder="Добавить заметку к тикету..."
                          value={noteText[c.id] ?? c.adminNote ?? ''}
                          onChange={e => setNoteText(prev => ({ ...prev, [c.id]: e.target.value }))}
                          style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12.5, outline: 'none' }}
                        />
                        <button onClick={() => handleNote(c)} disabled={!noteText[c.id]?.trim() || aNote?.s === 'loading'}
                          style={{ padding: '0 12px', height: 32, borderRadius: 6, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                          {aNote?.s === 'loading' ? '…' : aNote?.s === 'ok' ? '✓' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ height: 88, borderRadius: 10, background: 'var(--bg-sunken)' }} />
      ))}
    </div>
  )
}
