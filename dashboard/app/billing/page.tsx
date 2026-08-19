'use client'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import KpiCard from '@/components/KpiCard'
import Chip from '@/components/Chip'
import { getToken } from '@/lib/adminApi'

/**
 * Основание для счёта.
 *
 * Первая опора монетизации из презентации — комиссия за успешный подбор.
 * Тарифа нет, эквайринга нет, юрлица для приёма денег может не быть — но
 * событие, за которое берут деньги, происходит уже сейчас: человек вышел и
 * отработал смену. Эта страница отвечает на вопрос «за что выставлять», а не
 * «сколько»: второе решается не кодом.
 *
 * Пока счёт выставляется руками, она и есть весь биллинг. Когда появится
 * тариф — здесь же появится и сумма.
 *
 * Невыходы и отмены показываем рядом намеренно. За них платить не за что, и
 * разговор с работодателем начнётся именно с них, а не с «вы должны».
 */

type Row = {
  employer_id: string
  компания: string
  выходов: number
  невыходов: number
  отменил: number
  отказов: number
  человек: number
}

function месяцНазад(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

function конецМесяца(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

export default function BillingPage() {
  const [from, setFrom] = useState(месяцНазад(0))
  const [to, setTo] = useState(конецМесяца(месяцНазад(0)))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updated, setUpdated] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/billing?from=${from}&to=${to}`, {
        headers: { 'X-Admin-Token': getToken() },
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows((data.компании ?? []) as Row[])
      setUpdated(new Date().toLocaleTimeString('ru-RU'))
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  const всего = (rows ?? []).reduce((s, r) => s + r.выходов, 0)
  const невыходов = (rows ?? []).reduce((s, r) => s + r.невыходов, 0)
  const отмен = (rows ?? []).reduce((s, r) => s + r.отменил, 0)

  const field: React.CSSProperties = {
    padding: '9px 12px', borderRadius: 'var(--radius-sm)', fontSize: 14,
    border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)',
  }

  return (
    <div>
      <PageHeader title="К счёту" lastUpdated={updated} onRefresh={load} />

      <div className="page-content" style={{ maxWidth: 1000 }}>

        <div className="g-3">
          <KpiCard label="Состоявшихся выходов" value={loading ? null : всего}
            sub="за выбранный период" />
          <KpiCard label="Невыходов" value={loading ? null : невыходов}
            sub="работник не пришёл" />
          <KpiCard label="Отменено работодателем" value={loading ? null : отмен}
            sub="платить не за что" />
        </div>

        <div className="jt-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Что это такое</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', maxWidth: '68ch' }}>
            Событие, за которое по презентации берут комиссию, — состоявшийся выход: работодатель
            отметил, что человек вышел и отработал. Здесь их количество по компаниям за период.
            Суммы нет: тариф не назначен, и придумывать его за вас страница не станет.
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 8, maxWidth: '68ch' }}>
            Считается с 19 августа 2026 — с того дня, когда у смен появился записанный исход.
            Всё, что было раньше, помечено как «отменено без причины» и сюда не идёт: приписать
            исход задним числом значило бы выставить счёт за выдумку.
          </div>
        </div>

        <div className="jt-card" style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            с <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={field} />
          </label>
          <label style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            по <input type="date" value={to} onChange={e => setTo(e.target.value)} style={field} />
          </label>
          <Button onClick={() => { const f = месяцНазад(1); setFrom(f); setTo(конецМесяца(f)) }}>
            Прошлый месяц
          </Button>
          <Button onClick={() => { const f = месяцНазад(0); setFrom(f); setTo(конецМесяца(f)) }}>
            Текущий месяц
          </Button>
        </div>

        {err && (
          <div className="jt-card" style={{ padding: 16, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13.5 }}>
            {err}
          </div>
        )}

        <div className="jt-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="jt-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  {['Компания', 'Выходов', 'Человек', 'Невыходов', 'Отменила сама', 'Отказов работников']
                    .map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} style={{ padding: 16, color: 'var(--ink-3)' }}>Считаю…</td></tr>}
                {!loading && rows !== null && !rows.length && (
                  <tr><td colSpan={6} style={{ padding: 16, color: 'var(--ink-3)' }}>
                    За этот период смен с записанным исходом нет.
                  </td></tr>
                )}
                {!loading && (rows ?? []).map(r => (
                  <tr key={r.employer_id}>
                    <td style={{ fontWeight: 550, color: 'var(--ink)' }}>{r.компания}</td>
                    <td className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.выходов}</td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>{r.человек}</td>
                    <td className="num">
                      {r.невыходов > 0 ? <Chip tone="negative">{r.невыходов}</Chip> : <span style={{ color: 'var(--ink-3)' }}>0</span>}
                    </td>
                    <td className="num">
                      {r.отменил > 0 ? <Chip tone="neutral">{r.отменил}</Chip> : <span style={{ color: 'var(--ink-3)' }}>0</span>}
                    </td>
                    <td className="num" style={{ color: 'var(--ink-2)' }}>{r.отказов}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', maxWidth: '68ch' }}>
          Чтобы брать деньги, а не только считать, нужны три вещи, которых нет в коде:
          назначенный тариф, юрлицо или ИП с расчётным счётом и подключённый эквайринг.
          Пока их нет, счёт выставляется вручную по этой таблице — и это нормальный первый шаг:
          продавать подписку раньше, чем появился первый платящий, обычно значит продавать не то.
        </div>
      </div>
    </div>
  )
}
