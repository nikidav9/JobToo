'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import Button from '@/components/Button'
import Chip from '@/components/Chip'
import { getToken } from '@/lib/adminApi'

/**
 * Ключи внешнего API.
 *
 * Страница отвечает на два вопроса, которые задаёт партнёр в первом же
 * письме: что этот ключ открывает и что он не открывает. Второе важнее:
 * список прав здесь короткий намеренно, и по нему видно, что персональных
 * данных за ним нет вовсе.
 *
 * Ключ показывается один раз — в момент выдачи. Не из вредности: в базе
 * лежит только его отпечаток, и «покажи ещё раз» невозможно даже для нас.
 * Зато утечка базы не даёт доступа ни к чему.
 */

type Key = {
  id: string
  name: string
  scopes: string[] | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
  hits: number
  rate_limit: number
}

const SCOPES: { id: string; label: string; desc: string }[] = [
  { id: 'vacancies:read', label: 'Чтение вакансий', desc: 'Открытые смены и постоянные вакансии, справочник станций' },
]

function when(v: string | null): string {
  if (!v) return '—'
  return new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [limit, setLimit] = useState(1000)
  const [fresh, setFresh] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [updated, setUpdated] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/admin/api-keys', { headers: { 'X-Admin-Token': getToken() } })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setKeys((data.items ?? []) as Key[])
      setUpdated(new Date().toLocaleTimeString('ru-RU'))
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!name.trim()) return
    setBusy(true); setErr(null); setFresh(null)
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() },
        body: JSON.stringify({ name, scopes: ['vacancies:read'], rate_limit: limit }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setFresh(data.key)
      setName('')
      await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  async function revoke(k: Key) {
    if (!confirm(`Отозвать ключ «${k.name}»? Партнёр перестанет получать данные сразу.`)) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() },
        body: JSON.stringify({ id: k.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  const box: React.CSSProperties = {
    border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: 'var(--bg-elev)',
  }

  return (
    <div>
      <PageHeader title="Ключи API" lastUpdated={updated} onRefresh={load} />

      <div className="page-content" style={{ maxWidth: 1000 }}>
        <div className="g-3">
          <KpiCard label="Ключей выдано" value={keys.length} sub="включая отозванные" />
          <KpiCard label="Работают" value={keys.filter(k => !k.revoked_at).length}
            sub="принимают запросы прямо сейчас" />
          <KpiCard label="Запросов за этот час"
            value={keys.filter(k => !k.revoked_at).reduce((s, k) => s + (k.hits ?? 0), 0)}
            sub="суммарно по действующим ключам" />
        </div>


        {/* Что даёт ключ. Первым делом, до всяких кнопок: партнёр спрашивает
            именно это, и отвечать на это в переписке каждый раз — дорого. */}
        <div className="jt-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Что открывает ключ</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13.5, color: 'var(--ink-2)' }}>
            <div><code>GET /api/v1/vacancies</code> — открытые смены и постоянные вакансии; фильтры по типу, метро и <code>updated_since</code></div>
            <div><code>GET /api/v1/metro</code> — станции, по которым сейчас есть вакансии</div>
            <div><code>GET /api/v1/health</code> — проверка доступности, работает без ключа</div>
            <div><code>GET /api/v1/openapi.json</code> — описание, по нему у партнёра генерируется клиент</div>
          </div>
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 13,
            background: 'var(--positive-soft)', border: '1px solid var(--positive-line)', color: 'var(--positive)',
          }}>
            Персональных данных в выдаче нет: ни телефонов, ни имён, ни того, кто разместил вакансию.
            Поэтому выдача ключа не требует договора об обработке персональных данных.
          </div>
        </div>

        {/* Выдача */}
        <div className="jt-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Выдать ключ</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Кому — например, «Яндекс Смены»"
              className="jt-input" style={{ flex: '1 1 260px' }} />
            <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              запросов в час{' '}
              <input type="number" value={limit} min={10} max={100000}
                onChange={e => setLimit(Math.max(10, Number(e.target.value) || 1000))}
                className="jt-input num" style={{ width: 96 }} />
            </label>
            <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>Выдать</Button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
            Права: {SCOPES.map(s => s.label).join(', ')}. Пока это всё, что есть, — приём откликов появится отдельным правом.
          </div>

          {fresh && (
            <div style={{
              marginTop: 14, padding: 12, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--accent)', background: 'var(--accent-soft)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Скопируйте сейчас — второй раз он не покажется
              </div>
              <code className="num" style={{
                display: 'block', wordBreak: 'break-all', fontSize: 13, padding: '8px 10px',
                borderRadius: 'var(--radius-sm)', background: 'var(--bg-elev)', border: '1px solid var(--line)',
              }}>{fresh}</code>
              <Button onClick={() => navigator.clipboard.writeText(fresh)} style={{ marginTop: 8 }}>
                Скопировать
              </Button>
            </div>
          )}
        </div>

        {err && (
          <div className="jt-card" style={{ padding: 16, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13.5 }}>{err}</div>
        )}

        {/* Список */}
        <div className="jt-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="jt-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  {['Кому', 'Права', 'Выдан', 'Последний запрос', 'За этот час', 'Состояние', ''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} style={{ padding: 16, color: 'var(--ink-3)' }}>Загружаю…</td></tr>}
                {!loading && !keys.length && (
                  <tr><td colSpan={7} style={{ padding: 16, color: 'var(--ink-3)' }}>Ключей пока нет.</td></tr>
                )}
                {keys.map(k => (
                  // Отозванный ключ приглушается фоном: список существует
                  // ровно затем, чтобы через полгода прочитать его целиком.
                  <tr key={k.id} style={{ background: k.revoked_at ? 'var(--bg-sunken)' : undefined }}>
                    <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{k.name}</td>
                    <td style={{ color: 'var(--ink-2)' }}>{(k.scopes ?? []).join(', ') || '—'}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{when(k.created_at)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap', color: 'var(--ink-2)' }}>{when(k.last_used_at)}</td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>
                      {k.hits} / {k.rate_limit}
                    </td>
                    <td>
                      {k.revoked_at
                        ? <Chip tone="negative">Отозван {when(k.revoked_at)}</Chip>
                        : <Chip tone="positive" dot>Работает</Chip>}
                    </td>
                    <td>
                      {!k.revoked_at && (
                        <Button variant="danger" style={{ height: 28, padding: '0 10px' }}
                          onClick={() => revoke(k)} disabled={busy}>
                          Отозвать
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          Отозванные ключи остаются в списке намеренно: через полгода по нему можно будет ответить,
          кто и когда выгружал наши вакансии.
        </div>
      </div>
    </div>
  )
}
