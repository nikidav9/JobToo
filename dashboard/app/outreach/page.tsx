'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import { downloadCSV } from '@/lib/csv-export'
import { getCallMarks, setCallMark, type CallMark } from '@/lib/calllog'

/**
 * Обзвон директоров.
 *
 * Всё предложение JobToo держится на пятерых директорах. Ещё тридцать
 * публиковали раньше и замолчали — пока были активны, они выложили 140 смен,
 * по двенадцать на человека. Вернуть пятерых из них — вчетверо больше смен,
 * чем выкладывается сейчас за неделю.
 *
 * Достучаться до них внутри приложения нельзя: у половины нет ни телеграма,
 * ни пушей, а за месяц туда заходили семеро из тридцати. Остаётся телефон —
 * и эта страница превращает «надо бы обзвонить» в список строк, где видно,
 * кому звонить первым и с чем.
 */

type Employer = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  company: string | null
  telegram_id: number | null
  push_token: string | null
  last_seen_at: string | null
  created_at: string
}

type Pub = { employer_id: string | null; created_at: string }
type Vac = { id: string; created_at: string; workers_found: number | null }

const DAY = 86_400_000

type Bucket = 'lapsed' | 'active' | 'never'

const BUCKET_LABEL: Record<Bucket, string> = {
  lapsed: 'Публиковали и замолчали',
  active: 'Публикуют сейчас',
  never: 'Ни разу не публиковали',
}

function ago(iso: string | null, now: number): string {
  if (!iso) return '—'
  const diff = now - new Date(iso).getTime()
  if (Number.isNaN(diff)) return '—'
  const days = Math.floor(diff / DAY)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 30) return `${days} дн назад`
  const months = Math.floor(days / 30)
  return `${months} мес назад`
}

export default function OutreachPage() {
  const [emps, setEmps] = useState<Employer[]>([])
  const [pubs, setPubs] = useState<Pub[]>([])
  const [weekVacs, setWeekVacs] = useState<Vac[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updated, setUpdated] = useState('')
  const [now, setNow] = useState(Date.now())
  const [bucket, setBucket] = useState<Bucket>('lapsed')
  const [q, setQ] = useState('')
  const [marks, setMarks] = useState<Record<string, CallMark>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: u }, { data: v }, { data: p }] = await Promise.all([
      supabase
        .from('jm_users')
        .select('id,first_name,last_name,phone,company,telegram_id,push_token,last_seen_at,created_at')
        .eq('role', 'employer'),
      supabase.from('jm_vacancies').select('employer_id,created_at,id,workers_found'),
      supabase.from('jm_perm_vacancies').select('employer_id,created_at'),
    ])
    setEmps((u ?? []) as Employer[])
    setPubs([...((v ?? []) as Pub[]), ...((p ?? []) as Pub[])])
    setWeekVacs((v ?? []) as unknown as Vac[])
    setNow(Date.now())
    setUpdated(new Date().toLocaleTimeString('ru'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setMarks(getCallMarks()) }, [])

  const rows = useMemo(() => {
    const stat = new Map<string, { count: number; last: string | null }>()
    for (const p of pubs) {
      if (!p.employer_id) continue
      const s = stat.get(p.employer_id) ?? { count: 0, last: null }
      s.count++
      if (!s.last || p.created_at > s.last) s.last = p.created_at
      stat.set(p.employer_id, s)
    }
    return emps.map(e => {
      const s = stat.get(e.id) ?? { count: 0, last: null }
      const daysSince = s.last ? Math.floor((now - new Date(s.last).getTime()) / DAY) : null
      const b: Bucket = !s.last ? 'never' : daysSince !== null && daysSince <= 7 ? 'active' : 'lapsed'
      return {
        ...e,
        published: s.count,
        lastPublish: s.last,
        bucket: b,
        reachable: Boolean(e.telegram_id || e.push_token),
      }
    })
  }, [emps, pubs, now])

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { lapsed: 0, active: 0, never: 0 }
    for (const r of rows) c[r.bucket]++
    return c
  }, [rows])

  // Сначала те, кто выкладывал больше всех: у них и привычка была, и повод
  // вернуться понятнее. Уже отмеченные звонки уходят вниз.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter(r => r.bucket === bucket)
      .filter(r => {
        if (!needle) return true
        const hay = [r.first_name, r.last_name, r.phone, r.company].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => {
        const ma = marks[a.id] ? 1 : 0
        const mb = marks[b.id] ? 1 : 0
        if (ma !== mb) return ma - mb
        return b.published - a.published
      })
  }, [rows, bucket, q, marks])

  // Главный довод в разговоре: сколько смен за последнюю неделю нашли
  // человека. Считаем здесь же, чтобы в тексте стояло сегодняшнее число, а
  // не выдумка.
  const week = useMemo(() => {
    const since = now - 7 * DAY
    const recent = weekVacs.filter(v => new Date(v.created_at).getTime() >= since)
    return { total: recent.length, filled: recent.filter(v => (v.workers_found ?? 0) > 0).length }
  }, [weekVacs, now])

  const potential = useMemo(
    () => rows.filter(r => r.bucket === 'lapsed').reduce((s, r) => s + r.published, 0),
    [rows]
  )

  function messageFor(r: { first_name: string | null; published: number; lastPublish: string | null }): string {
    const name = r.first_name?.trim() || 'Здравствуйте'
    const when = r.lastPublish
      ? new Date(r.lastPublish).toLocaleDateString('ru', { day: 'numeric', month: 'long' })
      : null
    const proof = week.total > 0
      ? `За последнюю неделю из ${week.total} выложенных смен человек нашёлся на ${week.filled}.`
      : ''
    return [
      `${name}, здравствуйте! Это Никита из JobToo.`,
      when
        ? `Вы выкладывали у нас смены — последний раз ${when}, всего ${r.published}.`
        : 'Вы регистрировались у нас как работодатель.',
      proof,
      'Если нужны люди на ближайшие дни — выложите смену, это минута: jobtoo.ru',
    ].filter(Boolean).join('\n\n')
  }

  async function copyMessage(r: { id: string; first_name: string | null; published: number; lastPublish: string | null }) {
    try {
      await navigator.clipboard.writeText(messageFor(r))
      setCopied(r.id)
      setTimeout(() => setCopied(c => (c === r.id ? null : c)), 2000)
    } catch {
      // Буфер недоступен — не страшно, текст всегда можно набрать руками.
    }
  }

  function toggleCall(id: string) {
    const next = marks[id] ? null : { at: new Date().toISOString(), note: '' }
    setCallMark(id, next)
    setMarks(getCallMarks())
  }

  function exportCsv() {
    downloadCSV(
      filtered.map(r => ({
        Имя: [r.first_name, r.last_name].filter(Boolean).join(' '),
        Телефон: r.phone ?? '',
        Компания: r.company ?? '',
        'Выложил смен': r.published,
        'Последняя публикация': r.lastPublish ? new Date(r.lastPublish).toLocaleDateString('ru') : '—',
        'Последний вход': r.last_seen_at ? new Date(r.last_seen_at).toLocaleDateString('ru') : 'ни разу',
        'Есть связь': r.reachable ? 'да' : 'нет',
        Звонили: marks[r.id] ? new Date(marks[r.id].at).toLocaleDateString('ru') : '',
      })),
      'obzvon.csv'
    )
  }

  return (
    <div>
      <PageHeader title="Обзвон директоров" lastUpdated={updated} onRefresh={load} />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
          <KpiCard label="Публикуют сейчас" value={counts.active} color="var(--positive)" sub="за последние 7 дней" />
          <KpiCard label="Замолчали" value={counts.lapsed} color="var(--negative)" sub="публиковали раньше" />
          <KpiCard label="Смен от замолчавших" value={potential} sub="столько они выложили, пока были активны" />
          <KpiCard label="Обзвонено" value={Object.keys(marks).length} sub="отметки хранятся в этом браузере" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {(Object.keys(BUCKET_LABEL) as Bucket[]).map(b => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: '1px solid var(--line)',
                background: bucket === b ? 'var(--accent)' : 'var(--bg-elev)',
                color: bucket === b ? '#fff' : 'var(--ink-2)',
              }}
            >
              {BUCKET_LABEL[b]} · {counts[b]}
            </button>
          ))}
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Имя, телефон, компания"
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 13, minWidth: 220,
              border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)',
            }}
          />
          <button
            onClick={exportCsv}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)',
            }}
          >
            Выгрузить CSV
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>Пусто</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => {
              const called = marks[r.id]
              return (
                <div
                  key={r.id}
                  style={{
                    display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
                    padding: '12px 14px', borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: called ? 'var(--bg-sunken)' : 'var(--bg-elev)',
                    opacity: called ? 0.6 : 1,
                  }}
                >
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                      {[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Без имени'}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                      {r.company || '—'}
                      {r.reachable ? '' : '  ·  нет связи в приложении'}
                    </div>
                  </div>

                  <a
                    href={`tel:+${(r.phone ?? '').replace(/\D/g, '')}`}
                    style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', flex: '0 0 auto' }}
                  >
                    {r.phone ?? '—'}
                  </a>

                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', flex: '0 0 auto', minWidth: 150 }}>
                    выложил <b style={{ color: 'var(--ink-2)' }}>{r.published}</b> смен
                    <br />
                    последняя — {ago(r.lastPublish, now)}
                  </div>

                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', flex: '0 0 auto', minWidth: 130 }}>
                    заходил {ago(r.last_seen_at, now)}
                  </div>

                  {/* Телеграм по номеру: t.me/+<цифры> открывает контакт, если
                      человек там есть. Текст подставить в ссылку нельзя —
                      телеграм такого не умеет, — поэтому рядом кнопка,
                      кладущая готовое сообщение в буфер. */}
                  <a
                    href={`https://t.me/+${(r.phone ?? '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '7px 12px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
                      border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--accent)',
                      flex: '0 0 auto',
                    }}
                  >
                    Telegram
                  </a>

                  <button
                    onClick={() => copyMessage(r)}
                    style={{
                      padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)',
                      flex: '0 0 auto',
                    }}
                  >
                    {copied === r.id ? 'Скопировано' : 'Текст'}
                  </button>

                  <button
                    onClick={() => toggleCall(r.id)}
                    style={{
                      padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: '1px solid var(--line)',
                      background: called ? 'var(--bg-elev)' : 'var(--accent)',
                      color: called ? 'var(--ink-3)' : '#fff',
                      flex: '0 0 auto',
                    }}
                  >
                    {called ? 'Отменить' : 'Позвонил'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
