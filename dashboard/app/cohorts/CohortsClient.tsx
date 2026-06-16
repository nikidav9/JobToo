'use client'
import { useCallback } from 'react'
import { fetchCohorts, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-sm)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--ink-3)', fontSize: 14 }}>
      Загрузка…
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
      <div style={{ color: 'var(--negative)', fontSize: 14 }}>{message}</div>
      {onRetry && (
        <button onClick={onRetry} style={{ fontSize: 13, padding: '6px 16px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elev)', cursor: 'pointer', color: 'var(--ink)' }}>
          Повторить
        </button>
      )}
    </div>
  )
}

function cellBg(pct: number | null): string {
  if (pct === null) return 'transparent'
  if (pct === 0) return '#F5F4F0'
  if (pct < 20) return '#C4E0D3'
  if (pct < 40) return '#8EC4A7'
  if (pct < 60) return '#5BA07A'
  if (pct < 80) return '#2E7D54'
  return '#1A6644'
}

function cellText(pct: number | null): string {
  if (pct === null) return 'var(--ink-4)'
  if (pct >= 40) return '#fff'
  return '#2E7D54'
}

export default function CohortsPage() {
  const fetcher = useCallback(() => fetchCohorts(), [])
  const { data: cohorts, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users', 'jm_likes', 'jm_messages'],
    intervalSec: 120,
  })

  if (loading) return <Loader />
  if (error || !cohorts) return <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />

  const maxRet1 = cohorts.table.length > 0
    ? Math.max(...cohorts.table.map(r => r.cols[1]).filter((v): v is number => v !== null))
    : null

  return (
    <div>
      <PageHeader title="Когортный анализ" intervalSec={120} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-3">
          <KpiCard label="Когорт (12 нед.)" value={cohorts.table.length} sparkColor={PALETTE.blue} />
          <KpiCard label="Недель отслеживания" value={5} sparkColor={PALETTE.purple} />
          <KpiCard
            label="Макс. удержание нед. 1"
            value={maxRet1 !== null && isFinite(maxRet1) ? `${maxRet1}%` : 'Н/Д'}
            sparkColor={PALETTE.green}
          />
        </div>

        <ChartCard title="Новые пользователи по неделям" sub="12 недель">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cohorts.weeklyBar} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
              <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Когортный анализ" sub="Удержание пользователей · % активных (лайки / сообщения)">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Неделя', 'Регистраций', 'Нед. 0', 'Нед. 1', 'Нед. 2', 'Нед. 3', 'Нед. 4'].map(col => (
                    <th key={col} style={{
                      padding: '8px 12px',
                      textAlign: col === 'Неделя' ? 'left' : 'center',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--ink-3)',
                      borderBottom: '1px solid var(--line)',
                      whiteSpace: 'nowrap',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.table.map((row, i) => (
                  <tr key={row.label} style={{ borderBottom: i < cohorts.table.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>
                      {row.label}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--ink-2)', fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>
                      {row.size}
                    </td>
                    {row.cols.map((pct, ci) => (
                      <td key={ci} style={{
                        padding: '6px 12px',
                        textAlign: 'center',
                        background: cellBg(pct),
                        color: cellText(pct),
                        fontFamily: 'Geist Mono, monospace',
                        fontSize: 12,
                        fontWeight: pct !== null && pct >= 40 ? 600 : 400,
                      }}>
                        {pct === null ? '—' : `${pct}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Color legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', marginRight: 4 }}>Удержание:</span>
            {[
              { label: '≥80%', bg: '#1A6644', text: '#fff' },
              { label: '≥60%', bg: '#2E7D54', text: '#fff' },
              { label: '≥40%', bg: '#5BA07A', text: '#fff' },
              { label: '≥20%', bg: '#8EC4A7', text: '#2E7D54' },
              { label: '<20%', bg: '#C4E0D3', text: '#2E7D54' },
              { label: '0%', bg: '#F5F4F0', text: '#9A9690' },
            ].map(({ label, bg, text }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 24, height: 16, borderRadius: 3, background: bg, display: 'grid', placeItems: 'center' }}>
                  <span style={{ fontSize: 9, color: text, fontWeight: 600 }}>{label.split('%')[0]}%</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
