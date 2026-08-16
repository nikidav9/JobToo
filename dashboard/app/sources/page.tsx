'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import { getToken } from '@/lib/adminApi'

/**
 * Источники чужих вакансий.
 *
 * Вторая половина агрегатора: сюда добавляют адрес фида партнёра, и с него
 * начинают втекать вакансии. Первая половина — «Ключи API» — про обратное:
 * там мы отдаём свои.
 *
 * Страница отвечает на один вопрос, который иначе выясняется жалобой: жив ли
 * фид. «Источник добавлен» ничего не значит — значит только «в последний
 * заход получено столько-то». Поэтому в таблице не настройки, а результат.
 */

type Source = {
  id: string
  name: string
  url: string
  enabled: boolean
  period_min: number
  last_run_at: string | null
  last_status: string | null
  last_count: number | null
}

type Stats = { всего: number; по_источникам: Record<string, number> }

function when(v: string | null): string {
  if (!v) return 'ни разу'
  const diff = Date.now() - new Date(v).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн назад`
}

const SAMPLE = 'https://jobtoo.ru/api/v1/sample-feed.json'

export default function SourcesPage() {
  const [items, setItems] = useState<Source[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [updated, setUpdated] = useState('')

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [header, setHeader] = useState('')
  const [value, setValue] = useState('')
  const [period, setPeriod] = useState(30)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/admin/ext-sources', { headers: { 'X-Admin-Token': getToken() } })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems((data.items ?? []) as Source[])
      setStats(data.stats ?? null)
      setUpdated(new Date().toLocaleTimeString('ru-RU'))
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function send(body: unknown, method: 'POST' | 'DELETE' = 'POST') {
    const res = await fetch('/api/admin/ext-sources', {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data
  }

  async function add() {
    if (!name.trim() || !url.trim()) return
    setBusy('add'); setErr(null)
    try {
      await send({ name, url, auth_header: header || null, auth_value: value || null, period_min: period })
      setName(''); setUrl(''); setHeader(''); setValue('')
      await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(null)
  }

  async function runNow(s: Source) {
    setBusy(s.id); setErr(null)
    try { await send({ run: s.id }); await load() }
    catch (e: any) { setErr(e.message) }
    setBusy(null)
  }

  async function toggle(s: Source) {
    setBusy(s.id); setErr(null)
    try { await send({ ...s, enabled: !s.enabled }); await load() }
    catch (e: any) { setErr(e.message) }
    setBusy(null)
  }

  async function remove(s: Source) {
    if (!confirm(`Удалить «${s.name}»? Все его вакансии тоже исчезнут из ленты.`)) return
    setBusy(s.id); setErr(null)
    try { await send({ id: s.id }, 'DELETE'); await load() }
    catch (e: any) { setErr(e.message) }
    setBusy(null)
  }

  const box: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: 'var(--radius)',
    padding: 16, background: 'var(--bg-elev)',
  }
  const field: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 'var(--radius-sm)', fontSize: 14,
    border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)',
  }

  return (
    <div>
      <PageHeader title="Источники вакансий" lastUpdated={updated} onRefresh={load} />

      <div style={{ padding: 24, display: 'grid', gap: 20, maxWidth: 1000 }}>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
          <KpiCard label="Источников" value={items.length} sub={`включено ${items.filter(s => s.enabled).length}`} />
          <KpiCard label="Чужих вакансий" value={stats?.всего ?? '—'} sub="сейчас в базе" />
          <KpiCard label="Своих в ленте" value="—" sub="считается на странице вакансий" />
        </div>

        <div style={box}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Как это работает</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', maxWidth: '68ch' }}>
            Партнёр даёт адрес, отдающий JSON. Мы забираем сами по расписанию — так партнёру
            не нужно заводить у себя очередь и следить за доставкой. Обязательных полей три:
            <code> id</code>, <code>title</code>, <code>url</code>. Формат целиком —{' '}
            <a href={SAMPLE} target="_blank" rel="noreferrer">образец фида</a>.
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 8, maxWidth: '68ch' }}>
            Ссылка обязательна: человек откликается у источника, а не у нас. Без неё это была бы
            перепечатка чужого объявления.
          </div>
        </div>

        <div style={box}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Добавить источник</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <input style={field} value={name} onChange={e => setName(e.target.value)} placeholder="Кто — например, «Яндекс Смены»" />
            <input style={field} value={url} onChange={e => setUrl(e.target.value)} placeholder="Адрес фида (https://…)" />
            <input style={field} value={header} onChange={e => setHeader(e.target.value)} placeholder="Заголовок доступа — если нужен" />
            <input style={field} value={value} onChange={e => setValue(e.target.value)} placeholder="Значение заголовка" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              заходить каждые{' '}
              <input type="number" min={5} max={1440} value={period}
                onChange={e => setPeriod(Math.max(5, Number(e.target.value) || 30))}
                style={{ ...field, width: 84, padding: '7px 10px', fontVariantNumeric: 'tabular-nums' }} /> мин
            </label>
            <button onClick={add} disabled={busy === 'add' || !name.trim() || !url.trim()}
              style={{
                padding: '9px 16px', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 500,
                border: 'none', background: 'var(--accent)', color: '#fff',
                cursor: busy === 'add' || !name.trim() || !url.trim() ? 'not-allowed' : 'pointer',
                opacity: busy === 'add' || !name.trim() || !url.trim() ? 0.5 : 1,
              }}>Добавить</button>
            <button onClick={() => { setName('Образец (проверка)'); setUrl(SAMPLE); setPeriod(60) }}
              style={{
                padding: '9px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13.5,
                border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', cursor: 'pointer',
              }}>Подставить наш образец</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8 }}>
            Смены на сегодня протухают за часы — для них 15–30 минут. Постоянные вакансии живут
            неделями, там хватит и раза в сутки.
          </div>
        </div>

        {err && <div style={{ ...box, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13.5 }}>{err}</div>}

        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)', textAlign: 'left' }}>
                {['Источник', 'Последний заход', 'Что вышло', 'В базе', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ padding: 16, color: 'var(--ink-3)' }}>Загружаю…</td></tr>}
              {!loading && !items.length && (
                <tr><td colSpan={5} style={{ padding: 16, color: 'var(--ink-3)' }}>
                  Источников пока нет. Нажмите «Подставить наш образец», чтобы посмотреть, как всё работает.
                </td></tr>
              )}
              {items.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)', opacity: s.enabled ? 1 : 0.55 }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 550 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', wordBreak: 'break-all' }}>{s.url}</div>
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {when(s.last_run_at)}
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>каждые {s.period_min} мин</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: (s.last_status ?? '').startsWith('ок') ? 'var(--ink-2)' : 'var(--negative)' }}>
                    {s.last_status ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                    {stats?.по_источникам?.[s.id] ?? 0}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => runNow(s)} disabled={busy === s.id}
                      style={{ marginRight: 8, padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12.5, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                      {busy === s.id ? '…' : 'Проверить'}
                    </button>
                    <button onClick={() => toggle(s)} disabled={busy === s.id}
                      style={{ marginRight: 8, padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12.5, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', cursor: 'pointer' }}>
                      {s.enabled ? 'Выключить' : 'Включить'}
                    </button>
                    <button onClick={() => remove(s)} disabled={busy === s.id}
                      style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12.5, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--negative)', cursor: 'pointer' }}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', maxWidth: '68ch' }}>
          Чужие вакансии пока копятся в базе, но в ленту приложения не выводятся. Это намеренно:
          показывать людям записи из непроверенного фида нельзя. Включим, когда появится настоящий
          источник — и сразу с пометкой, откуда вакансия и куда она ведёт.
        </div>
      </div>
    </div>
  )
}
