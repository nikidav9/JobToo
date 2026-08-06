'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'

/**
 * Переписка с ботом.
 *
 * Люди пишут боту охотно — за первый вечер ответили десять из сорока двух
 * опрошенных, — но разговор жил только в телеграме. Пролистать его назад,
 * понять, кому уже ответили, а кто ждёт второй день, было нельзя.
 *
 * Здесь он собран по людям: свежие сверху, видно, что сказал человек, что
 * ответил бот и требуется ли живой ответ. Отвечать по-прежнему в телеграме —
 * реплаем на пересланное сообщение; эта страница отвечает на вопрос «кому».
 */

type Msg = {
  id: string
  user_id: string | null
  telegram_id: number
  name: string | null
  username: string | null
  text: string
  created_at: string
  direction: string | null
  topic: string | null
}

type User = {
  id: string
  role: string | null
  phone: string | null
  metro_station: string | null
}

// Темы, которые бот закрывает сам. Всё остальное — и всё нераспознанное —
// ждёт живого ответа.
const SELF_SERVED = new Set([
  'pay', 'payout_when', 'duties', 'experience', 'age', 'who_can', 'shift_length',
  'perm', 'shifts', 'shifts_station', 'shifts_night', 'shifts_morning',
  'howto', 'chat', 'profile', 'delete_account', 'where_to_go', 'what_to_take',
  'region', 'about', 'thanks', 'greeting', 'not_needed',
  'q_far', 'q_time', 'q_howto', 'q_employed',
])

const URGENT = new Set(['complaint', 'fraud'])

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

export default function BotInboxPage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [loading, setLoading] = useState(true)
  const [onlyWaiting, setOnlyWaiting] = useState(false)
  const [updated, setUpdated] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jm_bot_messages')
      .select('id,user_id,telegram_id,name,username,text,created_at,direction,topic')
      .order('created_at', { ascending: false })
      .limit(500)
    const rows = (data ?? []) as Msg[]
    setMsgs(rows)

    const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[]
    if (ids.length) {
      const { data: us } = await supabase
        .from('jm_users').select('id,role,phone,metro_station').in('id', ids)
      const map: Record<string, User> = {}
      for (const u of (us ?? []) as User[]) map[u.id] = u
      setUsers(map)
    }
    setUpdated(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Группируем по собеседнику: разговор читается целиком, а не строками
  // вперемешку с чужими.
  const threads = useMemo(() => {
    const by = new Map<number, Msg[]>()
    for (const m of msgs) {
      const list = by.get(m.telegram_id) ?? []
      list.push(m)
      by.set(m.telegram_id, list)
    }
    const out = Array.from(by.entries()).map(([tg, list]) => {
      const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const last = sorted[sorted.length - 1]
      const lastIn = [...sorted].reverse().find(m => m.direction !== 'out')

      // Ждёт ответа: последним написал человек, и бот не закрыл тему сам.
      const waiting = !!lastIn && last.direction !== 'out'
        ? true
        : !!lastIn && !SELF_SERVED.has(lastIn.topic ?? '') && last.direction === 'out'
          && !SELF_SERVED.has(last.topic ?? '') && last.topic !== 'admin'

      const urgent = sorted.some(m => URGENT.has(m.topic ?? ''))
      const who = sorted.find(m => m.name)?.name ?? 'Без имени'
      const u = sorted.map(m => m.user_id).filter(Boolean)[0] as string | undefined
      return { tg, who, user: u ? users[u] : undefined, msgs: sorted, last, waiting, urgent }
    })
    out.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))
    return onlyWaiting ? out.filter(t => t.waiting || t.urgent) : out
  }, [msgs, users, onlyWaiting])

  const waitingCount = useMemo(
    () => threads.filter(t => t.waiting || t.urgent).length, [threads])

  return (
    <div>
      <PageHeader title="Переписка с ботом" lastUpdated={updated} onRefresh={load} />

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
          {onlyWaiting ? 'Показать все' : 'Только те, кто ждёт ответа'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          {loading ? 'Загружаю…' : `Разговоров: ${threads.length}${onlyWaiting ? '' : ` · ждут ответа: ${waitingCount}`}`}
        </span>
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!loading && threads.length === 0 ? (
          <div style={{ color: 'var(--ink-4)', fontSize: 14 }}>Боту пока никто не писал.</div>
        ) : null}

        {threads.map(t => (
          <div key={t.tg} style={{
            border: '1px solid var(--line)', borderRadius: 14, padding: 14,
            background: 'var(--surface, #fff)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15 }}>{t.who}</strong>
              {t.urgent ? <Tag color="#B33C2A">🔴 срочно</Tag>
                : t.waiting ? <Tag color="#A87020">❗ ждёт ответа</Tag>
                : <Tag color="#2E7D54">🤖 бот ответил</Tag>}
              <span style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>
                {[t.user?.role, t.user?.phone, t.user?.metro_station].filter(Boolean).join(' · ') || 'нет профиля'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-4)' }}>
                {ago(t.last.created_at)}
              </span>
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {t.msgs.slice(-8).map(m => (
                <div key={m.id} style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
                  <span style={{ flexShrink: 0, width: 46, color: 'var(--ink-4)', fontSize: 12 }}>
                    {ago(m.created_at)}
                  </span>
                  <span style={{ flexShrink: 0 }}>{m.direction === 'out' ? '🤖' : '👤'}</span>
                  <span style={{
                    whiteSpace: 'pre-wrap',
                    color: m.direction === 'out' ? 'var(--ink-3)' : 'var(--ink)',
                  }}>{m.text}</span>
                </div>
              ))}
            </div>

            {t.user?.phone ? (
              <div style={{ marginTop: 10 }}>
                <a href={`https://t.me/+${t.user.phone.replace(/\D/g, '')}`}
                   target="_blank" rel="noreferrer"
                   style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent, #C8501E)' }}>
                  Написать в телеграм →
                </a>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, color,
      border: `1px solid ${color}33`, background: `${color}14`,
      borderRadius: 100, padding: '2px 9px',
    }}>{children}</span>
  )
}
