'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import { downloadCSV } from '@/lib/csv-export'
import FilterChips from '@/components/FilterChips'
import Chip from '@/components/Chip'
import { IconBan } from '@/components/icons'

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

// Подписи — диапазонами, а не «сегодня» и «за неделю».
//
// Срезы не пересекаются: человек попадает ровно в один. А подписи читались
// накопительно — и «Сегодня» показывало число, из которого вычтены те, кто в
// сети прямо сейчас. Рядом карточка сверху показывала за то же «сегодня»
// другое число, потому что складывала два среза. Одно слово, два разных
// числа на одном экране — отсюда и ощущение, что считает неверно.
//
// Считало верно. Врали подписи.
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'online', label: 'Сейчас в сети' },
  { key: 'today', label: 'До суток назад' },
  { key: 'week', label: '1–7 дней назад' },
  { key: 'month', label: '7–30 дней назад' },
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
  never: 'var(--ink-3)',
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
    const selectedRows = role === 'all' ? rows : rows.filter(r => r.role === role)
    const c: Record<Bucket, number> = { all: selectedRows.length, online: 0, today: 0, week: 0, month: 0, stale: 0, never: 0 }
    for (const r of selectedRows) c[bucketOf(r.last_seen_at, now)]++
    return c
  }, [rows, role, now])

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

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <KpiCard label="Сейчас в сети" value={counts.online} sub="за последние 3 минуты" color="var(--positive)" />
          <KpiCard label="Заходили за сутки" value={counts.online + counts.today} sub="включая тех, кто в сети" />
          <KpiCard label="Заходили за неделю" value={counts.online + counts.today + counts.week} sub="включая сутки" />
          <KpiCard label="Не заходили 30+ дней" value={counts.stale} sub="но хоть раз заходили" color="var(--negative)" />
          <KpiCard label="Ни разу не заходили" value={counts.never} sub="с момента регистрации" color="var(--ink-3)" />
          <KpiCard label="К реактивации" value={counts.stale + counts.never} sub="30+ дней или ни разу" color="var(--negative)" />
        </div>

        {/* Фильтры */}
        {/* Два ряда, а не один с распоркой посередине. Прежде срезы, роль и
            поиск стояли в одной строке, и на узком экране распорка flex:1
            выталкивала поле поиска на соседние кнопки. */}
        <FilterChips
          options={BUCKETS.map(b => ({ ...b, count: counts[b.key] }))}
          value={bucket}
          onChange={setBucket}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <select
            value={role}
            onChange={e => setRole(e.target.value as any)}
            style={{ height: 30, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 13 }}
          >
            <option value="all">Все роли</option>
            <option value="worker">Работники</option>
            <option value="employer">Работодатели</option>
          </select>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Имя, телефон, метро…"
            style={{ height: 30, padding: '0 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 13, minWidth: 200 }}
          />
          <button
            onClick={exportCsv}
            className="jt-icon-btn" style={{ width: 'auto', padding: '0 12px', height: 30 }}
          >
            Скачать CSV
          </button>
        </div>

        {/* Таблица */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="jt-table">
              <thead>
                <tr>
                  {['Пользователь', 'Роль', 'Метро', 'Последний вход', 'Когда', 'Регистрация'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>Загрузка…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>Никого не нашлось</td></tr>
                ) : filtered.map(r => {
                  const b = bucketOf(r.last_seen_at, now)
                  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.phone || '—'
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ color: 'var(--ink)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {name}
                          {r.is_blocked ? <Chip tone="negative"><IconBan size={11} />Заблокирован</Chip> : null}
                        </div>
                        <div className="num" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{r.phone ?? ''}{r.company ? ` · ${r.company}` : ''}</div>
                      </td>
                      <td style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {r.role === 'worker' ? 'Работник' : 'Работодатель'}
                      </td>
                      <td style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>{r.metro_station ?? '—'}</td>
                      <td className="num" style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{fullDate(r.last_seen_at)}</td>
                      <td style={{ whiteSpace: 'nowrap', color: TONE[b], fontWeight: b === 'online' ? 600 : 400 }}>
                        {b === 'online' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} />
                            в сети
                          </span>
                        ) : ago(r.last_seen_at, now)}
                      </td>
                      <td className="num" style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{fullDate(r.created_at)}</td>
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
