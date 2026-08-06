'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getToken } from '@/lib/adminApi'
import PageHeader from '@/components/PageHeader'

/**
 * Поддержка.
 *
 * Обращения из приложения: человек нажал «Помощь и поддержка» и написал.
 * О каждом первом сообщении бот пишет в телеграм, но отвечать удобнее
 * здесь — видно всю переписку и кто ждёт дольше всех.
 *
 * Ответ уходит человеку в приложение и всеми каналами, какие у него есть:
 * он ждёт именно его, а не «мы приняли обращение».
 */

const FROM_HOUR = 10
const TO_HOUR = 21

type Msg = {
  id: string
  user_id: string
  direction: string
  text: string
  created_at: string
}

type User = {
  id: string
  first_name: string | null
  last_name: string | null
  role: string | null
  phone: string | null
  metro_station: string | null
}

function ago(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((midnight(now) - midnight(d)) / 86_400_000)
  const p2 = (n: number) => n.toString().padStart(2, '0')
  if (days <= 0) return `${p2(d.getHours())}:${p2(d.getMinutes())}`
  if (days < 7) return `${days}д`
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`
}

/** Сколько человек ждёт ответа — в часах, чтобы было видно просрочку. */
function waitingHours(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
}

export default function SupportPage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [loading, setLoading] = useState(true)
  const [onlyWaiting, setOnlyWaiting] = useState(true)
  const [updated, setUpdated] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)
  const [notice, setNotice] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jm_support_messages')
      .select('id,user_id,direction,text,created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    const rows = (data ?? []) as Msg[]
    setMsgs(rows)

    const ids = Array.from(new Set(rows.map(r => r.user_id)))
    if (ids.length) {
      const { data: us } = await supabase
        .from('jm_users').select('id,first_name,last_name,role,phone,metro_station').in('id', ids)
      const map: Record<string, User> = {}
      for (const u of (us ?? []) as User[]) map[u.id] = u
      setUsers(map)
    }
    setUpdated(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // Обращение может прийти в любой момент — подтягиваем сами.
  useEffect(() => {
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const send = async (userId: string) => {
    const text = (drafts[userId] ?? '').trim()
    if (!text || sending) return
    setSending(userId)
    setNotice(n => ({ ...n, [userId]: '' }))
    try {
      const res = await fetch('/api/admin/support-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() },
        body: JSON.stringify({ userId, text }),
      })
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error ?? 'Не отправилось')
      setDrafts(d => ({ ...d, [userId]: '' }))
      setNotice(n => ({ ...n, [userId]: 'Отправлено' }))
      await load()
    } catch (e: any) {
      setNotice(n => ({ ...n, [userId]: e.message ?? 'Не отправилось' }))
    } finally {
      setSending(null)
    }
  }

  const threads = useMemo(() => {
    const by = new Map<string, Msg[]>()
    for (const m of msgs) {
      const list = by.get(m.user_id) ?? []
      list.push(m)
      by.set(m.user_id, list)
    }
    const out = Array.from(by.entries()).map(([uid, list]) => {
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const last = sorted[sorted.length - 1]
      const waiting = last.direction === 'in'
      const lastIn = [...sorted].reverse().find(m => m.direction === 'in')
      return {
        uid, user: users[uid], msgs: sorted, last, waiting,
        hours: waiting && lastIn ? waitingHours(lastIn.created_at) : 0,
      }
    })
    out.sort((a, b) => {
      if (a.waiting !== b.waiting) return a.waiting ? -1 : 1
      return b.last.created_at.localeCompare(a.last.created_at)
    })
    return onlyWaiting ? out.filter(t => t.waiting) : out
  }, [msgs, users, onlyWaiting])

  const waitingCount = msgs.length ? threads.filter(t => t.waiting).length : 0
  const mskHour = (new Date().getUTCHours() + 3) % 24
  const openNow = mskHour >= FROM_HOUR && mskHour < TO_HOUR

  return (
    <div>
      <PageHeader title="Поддержка" lastUpdated={updated} onRefresh={load} />

      <div style={{ padding: '14px 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setOnlyWaiting(v => !v)}
          style={{
            padding: '7px 14px', borderRadius: 100, cursor: 'pointer',
            border: '1px solid var(--line)', fontSize: 13, fontWeight: 600,
            background: onlyWaiting ? 'var(--ink)' : 'transparent',
            color: onlyWaiting ? '#fff' : 'var(--ink-3)',
          }}
        >
          {onlyWaiting ? 'Показать все' : 'Только ждущие ответа'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          {loading ? 'Загружаю…' : `Обращений: ${threads.length}${onlyWaiting ? '' : ` · ждут: ${waitingCount}`}`}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 12.5, fontWeight: 600,
          color: openNow ? '#2E7D54' : '#A87020',
        }}>
          {openNow ? `Рабочее время · до ${TO_HOUR}:00` : `Нерабочее время · с ${FROM_HOUR}:00 до ${TO_HOUR}:00`}
        </span>
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!loading && threads.length === 0 ? (
          <div style={{ color: 'var(--ink-4)', fontSize: 14 }}>
            {onlyWaiting ? 'Никто не ждёт ответа.' : 'Обращений пока нет.'}
          </div>
        ) : null}

        {threads.map(t => {
          const name = [t.user?.first_name, t.user?.last_name].filter(Boolean).join(' ') || 'Без имени'
          const late = t.waiting && t.hours >= 12
          return (
            <div key={t.uid} style={{
              border: `1px solid ${late ? '#B33C2A55' : 'var(--line)'}`,
              borderRadius: 14, padding: 14, background: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>{name}</strong>
                {t.waiting ? (
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: late ? '#B33C2A' : '#A87020',
                    border: `1px solid ${late ? '#B33C2A33' : '#A8702033'}`,
                    background: late ? '#B33C2A14' : '#A8702014',
                    borderRadius: 100, padding: '2px 9px',
                  }}>
                    {t.hours < 1 ? '❗ ждёт ответа' : `❗ ждёт ${t.hours} ч`}
                  </span>
                ) : (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: '#2E7D54',
                    border: '1px solid #2E7D5433', background: '#2E7D5414',
                    borderRadius: 100, padding: '2px 9px',
                  }}>отвечено</span>
                )}
                <span style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>
                  {[t.user?.role, t.user?.phone, t.user?.metro_station].filter(Boolean).join(' · ') || '—'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-4)' }}>
                  {ago(t.last.created_at)}
                </span>
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.msgs.slice(-12).map(m => (
                  <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
                    <span style={{ flexShrink: 0, width: 46, color: 'var(--ink-4)', fontSize: 12 }}>
                      {ago(m.created_at)}
                    </span>
                    <span style={{ flexShrink: 0 }}>{m.direction === 'out' ? '🎧' : '👤'}</span>
                    <span style={{
                      whiteSpace: 'pre-wrap', minWidth: 0,
                      color: m.direction === 'out' ? 'var(--ink-3)' : 'var(--ink)',
                    }}>{m.text}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={drafts[t.uid] ?? ''}
                  onChange={e => setDrafts(d => ({ ...d, [t.uid]: e.target.value }))}
                  placeholder="Ответ уйдёт в приложение, а также в телеграм и пушем"
                  rows={2}
                  style={{
                    flex: 1, resize: 'vertical', minHeight: 44, padding: '9px 11px',
                    border: '1px solid var(--line)', borderRadius: 10, fontSize: 13.5,
                    fontFamily: 'inherit', lineHeight: 1.4,
                  }}
                />
                <button
                  onClick={() => send(t.uid)}
                  disabled={sending === t.uid || !(drafts[t.uid] ?? '').trim()}
                  style={{
                    padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontSize: 13.5, fontWeight: 700, color: '#fff',
                    background: (drafts[t.uid] ?? '').trim() ? '#C8501E' : '#C9C5BF',
                  }}
                >
                  {sending === t.uid ? '…' : 'Ответить'}
                </button>
              </div>

              {notice[t.uid] ? (
                <div style={{
                  marginTop: 6, fontSize: 12.5,
                  color: notice[t.uid] === 'Отправлено' ? '#2E7D54' : '#B33C2A',
                }}>{notice[t.uid]}</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
