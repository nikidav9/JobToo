'use client'
import { useCallback, useState } from 'react'
import { supabaseAdmin } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import PageHeader from '@/components/PageHeader'
import { blockUser, sendSystemMessage } from '@/lib/admin-actions'
import { fetchChats } from '@/lib/queries'

async function fetchModeration() {
  const [{ data: complaints }, { data: users }] = await Promise.all([
    supabaseAdmin.from('jm_complaints').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('jm_users').select('id,first_name,last_name,phone,role,is_blocked'),
  ])

  const userMap: Record<string, any> = {}
  for (const u of users ?? []) userMap[u.id] = u

  function uName(u: any) {
    if (!u) return '—'
    const n = [u.first_name, u.last_name].filter(Boolean).join(' ')
    return n || u.phone || '—'
  }

  const list = (complaints ?? []).map((c: any) => ({
    id: c.id,
    type: c.complaint_type ?? '—',
    description: c.description ?? '—',
    reporterId: c.reporter_id ?? null,
    targetId: c.target_id ?? null,
    reporterName: uName(userMap[c.reporter_id]),
    reporterPhone: c.reporter_phone ?? userMap[c.reporter_id]?.phone ?? '—',
    targetName: uName(userMap[c.target_id]),
    targetPhone: c.target_phone ?? userMap[c.target_id]?.phone ?? '—',
    targetBlocked: userMap[c.target_id]?.is_blocked ?? false,
    status: c.status ?? 'pending',
    date: c.created_at?.slice(0, 10) ?? '',
  }))

  return { list }
}

type Status = 'idle' | 'loading' | 'ok' | 'err'

export default function ModerationPage() {
  const fetcher = useCallback(() => fetchModeration(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_complaints', 'jm_users'],
    intervalSec: 30,
  })

  const chatsFetcher = useCallback(() => fetchChats(), [])
  const { data: chats } = useRealtime(chatsFetcher, { tables: ['jm_chats'], intervalSec: 60 })

  const [status, setStatus] = useState<Record<string, { s: Status; msg?: string }>>({})
  const [sysMsgChat, setSysMsgChat] = useState('')
  const [sysMsgText, setSysMsgText] = useState('')
  const [sysMsgStatus, setSysMsgStatus] = useState<Status>('idle')

  function setS(id: string, s: Status, msg?: string) {
    setStatus(prev => ({ ...prev, [id]: { s, msg } }))
  }

  async function handleBlock(c: any) {
    setS(c.id, 'loading')
    try {
      await blockUser(c.targetId, !c.targetBlocked)
      setS(c.id, 'ok', c.targetBlocked ? 'Разблокирован' : 'Заблокирован')
      setTimeout(refresh, 800)
    } catch (e: any) {
      setS(c.id, 'err', e.message)
    }
  }

  async function handleSysMsg() {
    if (!sysMsgChat || !sysMsgText.trim()) return
    setSysMsgStatus('loading')
    try {
      await sendSystemMessage(sysMsgChat, sysMsgText.trim())
      setSysMsgStatus('ok')
      setSysMsgText('')
      setTimeout(() => setSysMsgStatus('idle'), 2000)
    } catch (e: any) {
      setSysMsgStatus('err')
    }
  }

  if (loading || !d) return <Loader />

  const pending = d.list.filter((c: any) => c.status === 'pending')
  const resolved = d.list.filter((c: any) => c.status !== 'pending')

  return (
    <div>
      <PageHeader title="Модерация" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
      <div className="page-content">

        {/* System message sender */}
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', marginBottom: 12 }}>
            💬 Системное сообщение в чат
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={sysMsgChat}
              onChange={e => setSysMsgChat(e.target.value)}
              style={{ flex: '0 0 240px', height: 34, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 12.5, outline: 'none' }}
            >
              <option value="">— Выберите чат —</option>
              {(chats ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.workerName} ↔ {c.employerName} · {c.vacTitle}</option>
              ))}
            </select>
            <input
              placeholder="Текст системного сообщения..."
              value={sysMsgText}
              onChange={e => setSysMsgText(e.target.value)}
              style={{ flex: 1, minWidth: 200, height: 34, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 12.5, outline: 'none' }}
            />
            <button
              onClick={handleSysMsg}
              disabled={!sysMsgChat || !sysMsgText.trim() || sysMsgStatus === 'loading'}
              style={{
                height: 34, padding: '0 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: sysMsgStatus === 'ok' ? 'var(--positive)' : sysMsgStatus === 'err' ? 'var(--negative)' : 'var(--ink)',
                color: '#fff', fontSize: 12.5, fontWeight: 500, transition: 'background .15s',
              }}
            >
              {sysMsgStatus === 'loading' ? 'Отправка…' : sysMsgStatus === 'ok' ? '✓ Отправлено' : sysMsgStatus === 'err' ? 'Ошибка' : 'Отправить'}
            </button>
          </div>
        </div>

        {/* Complaints */}
        <Section title={`Жалобы · ${pending.length} новых`}>
          {d.list.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Жалоб нет</div>
          )}
          {d.list.map((c: any) => {
            const st = status[c.id]
            return (
              <div key={c.id} style={{
                border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px',
                background: 'var(--bg-elev)', boxShadow: 'var(--shadow-sm)',
                opacity: c.status !== 'pending' ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
                        Жалоба · {c.type}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace' }}>{c.date}</span>
                      {c.status !== 'pending' && (
                        <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(46,125,84,.1)', color: 'var(--positive)', fontWeight: 500 }}>{c.status}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 8, lineHeight: 1.5 }}>
                      {c.description}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                      <span>👤 От: <strong style={{ color: 'var(--ink)' }}>{c.reporterName}</strong> {c.reporterPhone}</span>
                      <span>🎯 На: <strong style={{ color: c.targetBlocked ? 'var(--negative)' : 'var(--ink)' }}>{c.targetName}</strong> {c.targetPhone}
                        {c.targetBlocked && <span style={{ marginLeft: 4, fontSize: 10.5, color: 'var(--negative)', fontWeight: 600 }}>БЛОК</span>}
                      </span>
                    </div>
                  </div>
                  {c.targetId && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <ActionBtn
                        label={c.targetBlocked ? 'Разблокировать' : 'Заблокировать'}
                        tone={c.targetBlocked ? 'neutral' : 'danger'}
                        loading={st?.s === 'loading'}
                        result={st?.s === 'ok' ? st.msg : st?.s === 'err' ? '✗ ' + st.msg : undefined}
                        onClick={() => handleBlock(c)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function ActionBtn({ label, tone, loading, result, onClick }: {
  label: string; tone: 'danger' | 'neutral' | 'primary'; loading?: boolean; result?: string; onClick: () => void
}) {
  const bg = tone === 'danger' ? 'var(--negative)' : tone === 'primary' ? 'var(--ink)' : 'var(--bg-sunken)'
  const col = tone === 'neutral' ? 'var(--ink-2)' : '#fff'
  if (result) return <span style={{ fontSize: 12, color: 'var(--positive)', fontWeight: 500 }}>{result}</span>
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: '5px 12px', borderRadius: 7, border: tone === 'neutral' ? '1px solid var(--line)' : 'none',
      background: bg, color: col, fontSize: 12, fontWeight: 500, cursor: 'pointer',
      opacity: loading ? 0.6 : 1, transition: 'opacity .12s',
    }}>
      {loading ? '…' : label}
    </button>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[120, 80, 80].map((h, i) => <div key={i} style={{ height: h, background: 'var(--bg-sunken)', borderRadius: 10 }} />)}
    </div>
  )
}
