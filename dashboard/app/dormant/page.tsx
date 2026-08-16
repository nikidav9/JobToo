'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import { downloadCSV } from '@/lib/csv-export'
import { sendTelegramToUsers, sendBothToUser } from '@/lib/admin-actions'
import FilterChips from '@/components/FilterChips'
import Button from '@/components/Button'
import Chip from '@/components/Chip'
import { IconPhone, IconSend } from '@/components/icons'

/**
 * Кто зарегистрировался и не вернулся.
 *
 * Таких почти три сотни — больше половины всех, кто вообще завёл здесь
 * учётную запись. Это не «неактивные пользователи», это люди, которые
 * однажды решили, что им нужна подработка, дошли до регистрации и не
 * получили от нас ни одной причины вернуться.
 *
 * Страница существует ради одного числа, которого нигде больше нет: скольким
 * из них мы физически можем что-то сказать. Телеграм-бот не пишет первым —
 * это правило Телеграма, и обойти его нечем. У кого нет ни привязанного
 * телеграма, ни установленного приложения, до того не доходит ничто, кроме
 * звонка. Планировать рассылку, не разделив эти три группы, значит выдумать
 * себе охват, которого нет.
 */

type Row = {
  id: string
  role: 'worker' | 'employer'
  first_name: string | null
  last_name: string | null
  phone: string | null
  company: string | null
  metro_station: string | null
  created_at: string
  telegram_id: number | null
  push_token: string | null
}

type Reach = 'telegram' | 'push' | 'phone'

const REACH_LABEL: Record<Reach, string> = {
  telegram: 'Телеграм',
  push: 'Пуш на устройство',
  phone: 'Только телефон',
}

/** Чем до человека вообще можно достучаться. Порядок — по надёжности.
 *
 *  Веб-пуш учитывается наравне с токеном приложения: до подписчика с айфона
 *  сообщение доходит так же. Раньше он здесь не проверялся вовсе, и такие
 *  люди попадали в «только телефон» — охват на этой странице выходил меньше,
 *  чем на «Сводке», где те же три канала считались правильно. */
function reachOf(r: Row, webPush: Set<string>): Reach {
  if (r.telegram_id) return 'telegram'
  if (r.push_token || webPush.has(r.id)) return 'push'
  return 'phone'
}

const DAY = 86_400_000

/** Доля рядом с абсолютным числом: «41 человек» без «из 281» не читается. */
function pctOf(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}% из ${total}` : '—'
}

export default function DormantPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'all' | 'worker' | 'employer'>('all')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [updated, setUpdated] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)
  const [webPush, setWebPush] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: subs }] = await Promise.all([
      supabase
        .from('jm_users')
        .select('id,role,first_name,last_name,phone,company,metro_station,created_at,telegram_id,push_token')
        .is('last_seen_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('jm_web_push_subscriptions').select('user_id'),
    ])
    setRows((data ?? []) as Row[])
    setWebPush(new Set((subs ?? []).map((x: any) => x.user_id)))
    setUpdated(new Date().toLocaleTimeString('ru-RU'))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(
    () => rows.filter(r => role === 'all' || r.role === role),
    [rows, role],
  )

  const groups = useMemo(() => {
    const g: Record<Reach, Row[]> = { telegram: [], push: [], phone: [] }
    for (const r of filtered) g[reachOf(r, webPush)].push(r)
    return g
  }, [filtered, webPush])

  // Сколько уже прошло с регистрации. Не украшение: человек, ушедший вчера,
  // и человек, ушедший полгода назад, — разные разговоры.
  const medianAge = useMemo(() => {
    if (!filtered.length) return 0
    const ages = filtered
      .map(r => (Date.now() - new Date(r.created_at).getTime()) / DAY)
      .sort((a, b) => a - b)
    return Math.round(ages[Math.floor(ages.length / 2)])
  }, [filtered])

  const roleCounts = useMemo(() => ({
    all: rows.length,
    worker: rows.filter(r => r.role === 'worker').length,
    employer: rows.filter(r => r.role === 'employer').length,
  }), [rows])

  async function sendTelegram() {
    const ids = groups.telegram.map(r => r.id)
    if (!ids.length || !text.trim()) return
    if (!confirm(`Отправить ${ids.length} чел. в телеграм? Отозвать будет нельзя.`)) return
    setBusy(true); setResult(null)
    try {
      // Порциями по сотне: столько принимает маршрут, и столько же не жалко
      // в случае промаха в тексте.
      let sent = 0, skipped = 0
      for (let i = 0; i < ids.length; i += 100) {
        const r = await sendTelegramToUsers(ids.slice(i, i + 100), text)
        sent += r.sent; skipped += r.skipped.length
      }
      setResult(`Телеграм: доставлено ${sent}, не дошло ${skipped}`)
    } catch (e: any) {
      setResult(`Ошибка: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function sendPush() {
    const list = groups.push
    if (!list.length || !text.trim()) return
    if (!confirm(`Отправить пуш ${list.length} чел.? Отозвать будет нельзя.`)) return
    setBusy(true); setResult(null)
    let ok = 0, fail = 0
    // По одному, а не пачкой: у пуша нет группового способа, зато каждый
    // отказ виден отдельно. Имя подставляем так же, как в телеграме.
    for (const r of list) {
      try {
        await sendBothToUser(r.id, 'JobToo', text.replace(/\{name\}/g, r.first_name ?? ''))
        ok++
      } catch { fail++ }
    }
    setResult(`Пуш: доставлено ${ok}, не дошло ${fail}`)
    setBusy(false)
  }

  // Текст в буфер — потому что подставить его в ссылку нельзя.
  //
  // t.me/+<номер> открывает переписку с этим человеком, если он есть в
  // телеграме, но предзаполнить сообщение телеграм не даёт. Значит порядок
  // такой: нажали «Текст», нажали «Телеграм», вставили. Два движения вместо
  // одного, зато работает и с теми, кто бота не подключал, — а таких как раз
  // большинство среди не заходивших.
  //
  // Пишется при этом с вашего личного аккаунта, а не от бота. Для десятка
  // человек это нормально, для трёхсот — нет: телеграм считает такое
  // рассылкой и ограничивает отправку незнакомым.
  async function copyFor(r: Row) {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text.replace(/\{name\}/g, r.first_name ?? ''))
      setCopied(r.id)
      setTimeout(() => setCopied(c => (c === r.id ? null : c)), 1500)
    } catch {
      setResult('Браузер не дал доступ к буферу обмена')
    }
  }

  function exportPhones() {
    downloadCSV(
      groups.phone.map(r => ({
        имя: [r.first_name, r.last_name].filter(Boolean).join(' '),
        роль: r.role === 'worker' ? 'работник' : 'работодатель',
        телефон: r.phone ?? '',
        компания: r.company ?? '',
        метро: r.metro_station ?? '',
        зарегистрирован: new Date(r.created_at).toLocaleDateString('ru-RU'),
      })),
      'не-заходили-только-телефон.csv',
    )
  }

  const canSend = text.trim().length > 0 && !busy

  return (
    <div>
      <PageHeader title="Ни разу не заходили" lastUpdated={updated} onRefresh={load} />

      <div className="page-content">
        <div className="g-4">
          <KpiCard label="Всего" value={filtered.length}
                   sub={medianAge ? `медиана ${medianAge} дн. с регистрации` : 'с момента регистрации'} />
          <KpiCard label="Достижимы телеграмом" value={groups.telegram.length}
                   sub={`${pctOf(groups.telegram.length, filtered.length)} · бот может написать`} />
          <KpiCard label="Достижимы пушем" value={groups.push.length}
                   sub={`${pctOf(groups.push.length, filtered.length)} · приложение или веб-пуш`} />
          <KpiCard label="Только телефон" value={groups.phone.length}
                   sub={`${pctOf(groups.phone.length, filtered.length)} · доходит лишь звонок`} />
        </div>

        <FilterChips
          options={[
            { key: 'all' as const, label: 'Все', count: roleCounts.all },
            { key: 'worker' as const, label: 'Работники', count: roleCounts.worker },
            { key: 'employer' as const, label: 'Работодатели', count: roleCounts.employer },
          ]}
          value={role}
          onChange={setRole}
        />

        <div className="jt-card" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Текст сообщения. <code>{'{name}'}</code> заменится на имя человека.
            Пустое имя — подставится пустота, поэтому лучше писать так, чтобы
            фраза читалась и без него. Кнопка «Текст» в строке кладёт это
            сообщение в буфер — для тех, кому пишут вручную с личного аккаунта.
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
            placeholder="{name}, здравствуйте! Вы регистрировались в JobToo…"
            className="jt-input" style={{ width: '100%' }} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Рассылка на три сотни человек не отзывается — поэтому вид
                «опасное», а не «главное действие». */}
            <Button variant="danger" disabled={!canSend || !groups.telegram.length} onClick={sendTelegram}>
              Отправить в телеграм ({groups.telegram.length})
            </Button>
            <Button variant="danger" disabled={!canSend || !groups.push.length} onClick={sendPush}>
              Отправить пушем ({groups.push.length})
            </Button>
            <Button disabled={!groups.phone.length} onClick={exportPhones}>
              Выгрузить телефоны ({groups.phone.length})
            </Button>
          </div>

          {busy && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Отправляю, не закрывайте страницу…</div>}
          {result && <div style={{ fontSize: 13, color: 'var(--ink)' }}>{result}</div>}
        </div>

        <div className="jt-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
            <table className="jt-table">
              <thead>
                <tr>
                  {['Имя', 'Роль', 'Телефон', 'Метро', 'Зарегистрирован', 'Как достучаться', 'Написать'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} style={{ padding: 16, color: 'var(--ink-3)' }}>Загружаю…</td></tr>
                )}
                {!loading && !filtered.length && (
                  <tr><td colSpan={7} style={{ padding: 16, color: 'var(--ink-3)' }}>Никого нет — все хоть раз заходили.</td></tr>
                )}
                {filtered.slice(0, 500).map(r => {
                  const reach = reachOf(r, webPush)
                  const digits = (r.phone ?? '').replace(/\D/g, '')
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--ink)' }}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ color: 'var(--ink-2)' }}>{r.role === 'worker' ? 'Работник' : 'Работодатель'}</td>
                      <td className="num" style={{ color: 'var(--ink-2)' }}>{r.phone ?? '—'}</td>
                      <td style={{ color: 'var(--ink-2)' }}>{r.metro_station ?? '—'}</td>
                      <td className="num" style={{ color: 'var(--ink-3)' }}>{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                      <td>
                        <Chip tone={reach === 'telegram' ? 'positive' : reach === 'push' ? 'info' : 'neutral'}>
                          {REACH_LABEL[reach]}
                        </Chip>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <a className="jt-icon-btn" style={{ width: 'auto', padding: '0 9px', textDecoration: 'none' }}
                             href={`tel:+${digits}`}>
                            <IconPhone size={12} />Позвонить
                          </a>
                          <a className="jt-icon-btn" style={{ width: 'auto', padding: '0 9px', textDecoration: 'none' }}
                             href={`https://t.me/+${digits}`} target="_blank" rel="noreferrer">
                            <IconSend size={12} />Телеграм
                          </a>
                          <button onClick={() => copyFor(r)} disabled={!text.trim()}
                            className="jt-icon-btn" style={{ width: 'auto', padding: '0 9px' }}
                            title="Скопировать текст, чтобы вставить в переписку вручную">
                            {copied === r.id ? 'Скопировано' : 'Текст'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-3)', borderTop: '1px solid var(--line)' }}>
              Показаны первые 500 из {filtered.length}. Отправка и выгрузка работают по всему списку.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
