'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import { downloadCSV } from '@/lib/csv-export'
import { sendTelegramToUsers, sendBothToUser } from '@/lib/admin-actions'

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
  push: 'Пуш в приложение',
  phone: 'Только телефон',
}

/** Чем до человека вообще можно достучаться. Порядок — по надёжности. */
function reachOf(r: Row): Reach {
  if (r.telegram_id) return 'telegram'
  if (r.push_token) return 'push'
  return 'phone'
}

const DAY = 86_400_000

export default function DormantPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'all' | 'worker' | 'employer'>('all')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [updated, setUpdated] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jm_users')
      .select('id,role,first_name,last_name,phone,company,metro_station,created_at,telegram_id,push_token')
      .is('last_seen_at', null)
      .order('created_at', { ascending: false })
    setRows((data ?? []) as Row[])
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
    for (const r of filtered) g[reachOf(r)].push(r)
    return g
  }, [filtered])

  // Сколько уже прошло с регистрации. Не украшение: человек, ушедший вчера,
  // и человек, ушедший полгода назад, — разные разговоры.
  const median = useMemo(() => {
    if (!filtered.length) return 0
    const ages = filtered
      .map(r => (Date.now() - new Date(r.created_at).getTime()) / DAY)
      .sort((a, b) => a - b)
    return Math.round(ages[Math.floor(ages.length / 2)])
  }, [filtered])

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

      <div style={{ padding: 24, display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KpiCard label="Всего" value={filtered.length}
                   sub={median ? `в среднем ${median} дн. с регистрации` : undefined} />
          <KpiCard label="Достижимы телеграмом" value={groups.telegram.length}
                   sub="бот может написать" color="var(--positive)" />
          <KpiCard label="Достижимы пушем" value={groups.push.length}
                   sub="стоит приложение" />
          <KpiCard label="Только телефон" value={groups.phone.length}
                   sub="ни бота, ни приложения" color="var(--negative)" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'worker', 'employer'] as const).map(k => (
            <button key={k} onClick={() => setRole(k)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: '1px solid var(--line)',
                background: role === k ? 'var(--accent)' : 'var(--bg)',
                color: role === k ? '#fff' : 'var(--ink-2)',
              }}>
              {k === 'all' ? 'Все' : k === 'worker' ? 'Работники' : 'Работодатели'}
            </button>
          ))}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Текст сообщения. <code>{'{name}'}</code> заменится на имя человека.
            Пустое имя — подставится пустота, поэтому лучше писать так, чтобы
            фраза читалась и без него.
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
            placeholder="{name}, здравствуйте! Вы регистрировались в JobToo…"
            style={{
              width: '100%', padding: 12, borderRadius: 8, fontSize: 14,
              border: '1px solid var(--line)', background: 'var(--bg)',
              color: 'var(--ink)', fontFamily: 'inherit', resize: 'vertical',
            }} />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button disabled={!canSend || !groups.telegram.length} onClick={sendTelegram}
              style={{
                padding: '9px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: canSend && groups.telegram.length ? 'pointer' : 'not-allowed',
                opacity: canSend && groups.telegram.length ? 1 : 0.5,
              }}>
              Отправить в телеграм ({groups.telegram.length})
            </button>
            <button disabled={!canSend || !groups.push.length} onClick={sendPush}
              style={{
                padding: '9px 16px', borderRadius: 8, fontSize: 14,
                border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)',
                cursor: canSend && groups.push.length ? 'pointer' : 'not-allowed',
                opacity: canSend && groups.push.length ? 1 : 0.5,
              }}>
              Отправить пушем ({groups.push.length})
            </button>
            <button disabled={!groups.phone.length} onClick={exportPhones}
              style={{
                padding: '9px 16px', borderRadius: 8, fontSize: 14,
                border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)',
                cursor: groups.phone.length ? 'pointer' : 'not-allowed',
                opacity: groups.phone.length ? 1 : 0.5,
              }}>
              Выгрузить телефоны ({groups.phone.length})
            </button>
          </div>

          {busy && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Отправляю, не закрывайте страницу…</div>}
          {result && <div style={{ fontSize: 13, color: 'var(--ink)' }}>{result}</div>}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)', textAlign: 'left' }}>
                {['Имя', 'Роль', 'Телефон', 'Метро', 'Зарегистрирован', 'Как достучаться'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--ink-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ padding: 16, color: 'var(--ink-4)' }}>Загружаю…</td></tr>
              )}
              {!loading && !filtered.length && (
                <tr><td colSpan={6} style={{ padding: 16, color: 'var(--ink-4)' }}>Никого нет — все хоть раз заходили.</td></tr>
              )}
              {filtered.slice(0, 500).map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '9px 12px' }}>{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>{r.role === 'worker' ? 'работник' : 'работодатель'}</td>
                  <td style={{ padding: '9px 12px' }}>{r.phone ?? '—'}</td>
                  <td style={{ padding: '9px 12px' }}>{r.metro_station ?? '—'}</td>
                  <td style={{ padding: '9px 12px' }}>{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                  <td style={{ padding: '9px 12px' }}>{REACH_LABEL[reachOf(r)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-4)' }}>
              Показаны первые 500 из {filtered.length}. Отправка и выгрузка работают по всему списку.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
