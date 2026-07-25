'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import { downloadCSV } from '@/lib/csv-export'

type Row = {
  id: string
  role: 'worker' | 'employer'
  first_name: string | null
  last_name: string | null
  phone: string | null
  company: string | null
  metro_station: string | null
  is_blocked: boolean | null
  created_at: string
  last_seen_at: string | null
}

/** Порог «в сети» тот же, что в приложении (services/presence.ts) */
const ONLINE_MS = 3 * 60 * 1000
const DAY = 86_400_000

type Bucket = 'all' | 'online' | 'today' | 'week' | 'month' | 'stale' | 'never'

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'online', label: 'Сейчас в сети' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'За неделю' },
  { key: 'month', label: 'За месяц' },
  { key: 'stale', label: 'Больше 30 дней' },
  { key: 'never', label: 'Ни разу' },
]

function bucketOf(lastSeen: string | null, now: number): Bucket {
  if (!lastSeen) return 'never'
  const diff = now - new Date(lastSeen).getTime()
  if (Number.isNaN(diff)) return 'never'
  if (diff < ONLINE_MS) return 'online'
  if (diff < DAY) return 'today'
  if (diff < 7 * DAY) return 'week'
  if (diff < 30 * DAY) return 'month'
  return 'stale'
}

/** «12 минут назад» / «3 дня назад» — читается быстрее, чем дата */
function ago(lastSeen: string | null, now: number): string {
  if (!lastSeen) return 'ни разу'
  const diff = now - new Date(lastSeen).getTime()
  if (Number.isNaN(diff)) return '—'
  if (diff < ONLINE_MS) return 'в сети'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} дн назад`
  const months = Math.floor(days / 30)
  return `${months} мес назад`
}

function fullDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const TONE: Record<Bucket, string> = {
  all: 'var(--ink-3)',
  online: 'var(--positive)',
  today: 'var(--positive)',
  week: 'var(--ink-2)',
  month: 'var(--ink-3)',
  stale: 'var(--negative)',
  never: 'var(--ink-4)',
}

export default function LastSeenPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [missingColumn, setMissingColumn] = useState(false)
  const [bucket, setBucket] = useState<Bucket>('all')
  const [role, setRole] = useState<'all' | 'worker' | 'employer'>('all')
  const [q, setQ] = useState('')
  // Пересчёт «сколько назад» без перезагрузки данных
  const [now, setNow] = useState(() => Date.now())
  const [updated, setUpdated] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jm_users')
      .select('id,role,first_name,last_name,phone,company,metro_station,is_blocked,created_at,last_seen_at')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
    // Колонки может ещё не быть — показываем понятную подсказку, а не пустоту
    if (error) { setMissingColumn(true); setLoading(false); return }
    setMissingColumn(false)
    setRows((data ?? []) as Row[])
    setNow(Date.now())
    setUpdated(new Date().toLocaleTimeString('ru'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { all: rows.length, online: 0, today: 0, week: 0, month: 0, stale: 0, never: 0 }
    for (const r of rows) c[bucketOf(r.last_seen_at, now)]++
    return c
  }, [rows, now])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (role !== 'all' && r.role !== role) return false
      if (bucket !== 'all' && bucketOf(r.last_seen_at, now) !== bucket) return false
      if (!needle) return true
      const hay = [r.first_name, r.last_name, r.phone, r.company, r.metro_station]
        .filter(Boolean).join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }, [rows, role, bucket, q, now])

  function exportCsv() {
    downloadCSV(filtered.map(r => ({
      Имя: [r.first_name, r.last_name].filter(Boolean).join(' '),
      Телефон: r.phone ?? '',
      Роль: r.role === 'worker' ? 'Работник' : 'Работодатель',
      Компания: r.company ?? '',
      Метро: r.metro_station ?? '',
      'Последний вход': fullDate(r.last_seen_at),
      'Сколько назад': ago(r.last_seen_at, now),
      Регистрация: fullDate(r.created_at),
    })), 'last-seen.csv')
  }

  return (
    <div>
      <PageHeader title="Последний вход" lastUpdated={updated} onRefresh={load} />

      {missingColumn ? (
        <div style={{ margin: 24, padding: 16, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
            Колонка last_seen_at ещё не создана
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            Выполните в Supabase миграцию <code>012_last_seen.sql</code>:
            <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--bg-sunken)', overflowX: 'auto', fontSize: 11.5 }}>
alter table jm_users add column if not exists last_seen_at timestamptz;
            </pre>
          </div>
        </div>
      ) : null}

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <KpiCard label="Сейчас в сети" value={counts.online} color="var(--positive)" />
          <KpiCard label="Заходили сегодня" value={counts.online + counts.today} />
          <KpiCard label="За неделю" value={counts.online + counts.today + counts.week} />
          <KpiCard label="Не заходили 30+ дней" value={counts.stale} color="var(--negative)" />
          <KpiCard label="Ни разу не заходили" value={counts.never} sub="с момента регистрации" />
        </div>

        {/* Фильтры */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {BUCKETS.map(b => (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              style={{
                padding: '6px 12px', borderRadius: 100, fontSize: 12.5, cursor: 'pointer',
                border: '1px solid ' + (bucket === b.key ? 'var(--accent)' : 'var(--line)'),
                background: bucket === b.key ? 'var(--accent)' : 'var(--bg-elev)',
                color: bucket === b.key ? '#fff' : 'var(--ink-2)',
              }}
            >
              {b.label} <span style={{ opacity: 0.7 }}>{counts[b.key]}</span>
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <select
            value={role}
            onChange={e => setRole(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12.5 }}
          >
            <option value="all">Все роли</option>
            <option value="worker">Работники</option>
            <option value="employer">Работодатели</option>
          </select>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Имя, телефон, метро…"
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12.5, minWidth: 190 }}
          />
          <button
            onClick={exportCsv}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', fontSize: 12.5, cursor: 'pointer' }}
          >
            CSV
          </button>
        </div>

        {/* Таблица */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: 'var(--bg-sunken)' }}>
                  {['Пользователь', 'Роль', 'Метро', 'Последний вход', 'Когда', 'Регистрация'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>Загрузка…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>Никого не нашлось</td></tr>
                ) : filtered.map(r => {
                  const b = bucketOf(r.last_seen_at, now)
                  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.phone || '—'
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: 'var(--ink)', fontWeight: 500 }}>
                          {name}
                          {r.is_blocked ? <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--negative)' }}>заблокирован</span> : null}
                        </div>
                        <div style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>{r.phone ?? ''}{r.company ? ` · ${r.company}` : ''}</div>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                        {r.role === 'worker' ? 'Работник' : 'Работодатель'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{r.metro_station ?? '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{fullDate(r.last_seen_at)}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: TONE[b], fontWeight: b === 'online' ? 600 : 400 }}>
                        {b === 'online' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} />
                            в сети
                          </span>
                        ) : ago(r.last_seen_at, now)}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{fullDate(r.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
