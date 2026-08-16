'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
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

      <div style={{ padding: 24, display: 'grid', gap: 20, maxWidth: 1000 }}>

        {/* Что даёт ключ. Первым делом, до всяких кнопок: партнёр спрашивает
            именно это, и отвечать на это в переписке каждый раз — дорого. */}
        <div style={box}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Что открывает ключ</div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13.5, color: 'var(--ink-2)' }}>
            <div><code>GET /api/v1/vacancies</code> — открытые смены и постоянные вакансии; фильтры по типу, метро и <code>updated_since</code></div>
            <div><code>GET /api/v1/metro</code> — станции, по которым сейчас есть вакансии</div>
            <div><code>GET /api/v1/health</code> — проверка доступности, работает без ключа</div>
            <div><code>GET /api/v1/openapi.json</code> — описание, по нему у партнёра генерируется клиент</div>
          </div>
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 8, fontSize: 13,
            background: 'rgba(46,125,84,.08)', color: 'var(--positive)',
          }}>
            Персональных данных в выдаче нет: ни телефонов, ни имён, ни того, кто разместил вакансию.
            Поэтому выдача ключа не требует договора об обработке персональных данных.
          </div>
        </div>

        {/* Выдача */}
        <div style={box}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Выдать ключ</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Кому — например, «Яндекс Смены»"
              style={{
                flex: '1 1 260px', padding: '9px 12px', borderRadius: 8, fontSize: 14,
                border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)',
              }} />
            <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              запросов в час{' '}
              <input type="number" value={limit} min={10} max={100000}
                onChange={e => setLimit(Math.max(10, Number(e.target.value) || 1000))}
                style={{
                  width: 90, padding: '8px 10px', borderRadius: 8, fontSize: 14,
                  border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                }} />
            </label>
            <button onClick={create} disabled={busy || !name.trim()}
              style={{
                padding: '9px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, border: 'none',
                background: 'var(--accent)', color: '#fff',
                cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || !name.trim() ? 0.5 : 1,
              }}>
              Выдать
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-4)', marginTop: 8 }}>
            Права: {SCOPES.map(s => s.label).join(', ')}. Пока это всё, что есть, — приём откликов появится отдельным правом.
          </div>

          {fresh && (
            <div style={{
              marginTop: 14, padding: 12, borderRadius: 8, border: '1px solid var(--accent)',
              background: 'rgba(209,78,27,.06)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Скопируйте сейчас — второй раз он не покажется
              </div>
              <code style={{
                display: 'block', wordBreak: 'break-all', fontSize: 13, padding: '8px 10px',
                borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--line)',
              }}>{fresh}</code>
              <button onClick={() => navigator.clipboard.writeText(fresh)}
                style={{
                  marginTop: 8, padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink-2)',
                }}>
                Скопировать
              </button>
            </div>
          )}
        </div>

        {err && (
          <div style={{ ...box, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13.5 }}>{err}</div>
        )}

        {/* Список */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--bg-sunken)', textAlign: 'left' }}>
                {['Кому', 'Права', 'Выдан', 'Последний запрос', 'За этот час', 'Состояние', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ padding: 16, color: 'var(--ink-4)' }}>Загружаю…</td></tr>}
              {!loading && !keys.length && (
                <tr><td colSpan={7} style={{ padding: 16, color: 'var(--ink-4)' }}>Ключей пока нет.</td></tr>
              )}
              {keys.map(k => (
                <tr key={k.id} style={{ borderTop: '1px solid var(--line)', opacity: k.revoked_at ? 0.5 : 1 }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500 }}>{k.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--ink-3)' }}>{(k.scopes ?? []).join(', ') || '—'}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{when(k.created_at)}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{when(k.last_used_at)}</td>
                  <td style={{ padding: '9px 12px', fontVariantNumeric: 'tabular-nums' }}>{k.hits} / {k.rate_limit}</td>
                  <td style={{ padding: '9px 12px' }}>
                    {k.revoked_at
                      ? <span style={{ color: 'var(--negative)' }}>отозван {when(k.revoked_at)}</span>
                      : <span style={{ color: 'var(--positive)' }}>работает</span>}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    {!k.revoked_at && (
                      <button onClick={() => revoke(k)} disabled={busy}
                        style={{
                          padding: '5px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer',
                          border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--negative)',
                        }}>
                        Отозвать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>
          Отозванные ключи остаются в списке намеренно: через полгода по нему можно будет ответить,
          кто и когда выгружал наши вакансии.
        </div>
      </div>
    </div>
  )
}
