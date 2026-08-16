'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import Chip from '@/components/Chip'
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

      <div className="page-content" style={{ maxWidth: 1000 }}>

        <div className="g-3">
          <KpiCard label="Источников" value={items.length}
            sub={items.length ? `включено ${items.filter(s => s.enabled).length}` : 'пока ни одного'} />
          <KpiCard label="Чужих вакансий" value={stats?.всего ?? null} sub="сейчас в базе" />
          {/* Карточка «Своих в ленте: —» показывала прочерк всегда: значение
              для неё нигде не считалось. Вместо неё — то, что здесь и правда
              важно знать: сколько источников отвалилось. */}
          <KpiCard label="Источников с ошибкой"
            value={items.filter(s => s.last_status && !s.last_status.startsWith('ок')).length}
            sub="последний заход не удался" />
        </div>

        <div className="jt-card" style={{ padding: 16 }}>
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

        <div className="jt-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Добавить источник</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <input className="jt-input" value={name} onChange={e => setName(e.target.value)} placeholder="Кто — например, «Яндекс Смены»" />
            <input className="jt-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="Адрес фида (https://…)" />
            <input className="jt-input" value={header} onChange={e => setHeader(e.target.value)} placeholder="Заголовок доступа — если нужен" />
            <input className="jt-input" value={value} onChange={e => setValue(e.target.value)} placeholder="Значение заголовка" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              заходить каждые{' '}
              <input type="number" min={5} max={1440} value={period}
                onChange={e => setPeriod(Math.max(5, Number(e.target.value) || 30))}
                className="jt-input num" style={{ width: 88 }} /> мин
            </label>
            <Button variant="primary" onClick={add} disabled={busy === 'add' || !name.trim() || !url.trim()}>
              Добавить
            </Button>
            <Button onClick={() => { setName('Образец (проверка)'); setUrl(SAMPLE); setPeriod(60) }}>
              Подставить наш образец
            </Button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8 }}>
            Смены на сегодня протухают за часы — для них 15–30 минут. Постоянные вакансии живут
            неделями, там хватит и раза в сутки.
          </div>
        </div>

        {err && <div className="jt-card" style={{ padding: 16, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13.5 }}>{err}</div>}

        <div className="jt-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table className="jt-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                {['Источник', 'Последний заход', 'Что вышло', 'В базе', ''].map(h => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ padding: 16, color: 'var(--ink-3)' }}>Загружаю…</td></tr>}
              {!loading && !items.length && (
                <tr><td colSpan={5} style={{ padding: 16, color: 'var(--ink-3)' }}>
                  Источников пока нет. Нажмите «Подставить наш образец», чтобы посмотреть, как всё работает.
                </td></tr>
              )}
              {items.map(s => {
                const failed = !!s.last_status && !s.last_status.startsWith('ок')
                return (
                  // Выключенный источник приглушается фоном, а не прозрачностью:
                  // при 0.55 его состояние перестаёт читаться, а именно за ним
                  // сюда и заходят.
                  <tr key={s.id} style={{ background: s.enabled ? undefined : 'var(--bg-sunken)' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 550, color: 'var(--ink)' }}>{s.name}</span>
                        {!s.enabled && <Chip tone="neutral">Выключен</Chip>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', wordBreak: 'break-all' }}>{s.url}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="num" style={{ color: 'var(--ink-2)' }}>{when(s.last_run_at)}</span>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>каждые {s.period_min} мин</div>
                    </td>
                    <td>
                      {s.last_status
                        ? <Chip tone={failed ? 'negative' : 'positive'}>{s.last_status}</Chip>
                        : <span style={{ color: 'var(--ink-3)' }}>ещё не заходили</span>}
                    </td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>
                      {stats?.по_источникам?.[s.id] ?? 0}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button style={{ height: 28, padding: '0 10px' }}
                          onClick={() => runNow(s)} disabled={busy === s.id}>
                          {busy === s.id ? '…' : 'Проверить'}
                        </Button>
                        <Button style={{ height: 28, padding: '0 10px' }}
                          onClick={() => toggle(s)} disabled={busy === s.id}>
                          {s.enabled ? 'Выключить' : 'Включить'}
                        </Button>
                        <Button variant="danger" style={{ height: 28, padding: '0 10px' }}
                          onClick={() => remove(s)} disabled={busy === s.id}>
                          Удалить
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
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
