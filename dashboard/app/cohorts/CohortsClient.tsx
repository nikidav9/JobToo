'use client'
import { useCallback } from 'react'
import { fetchCohorts, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import PageSkeleton from '@/components/PageSkeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { AXIS, GRID, LEGEND, TT } from '@/lib/chart'



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

/**
 * Лестница удержания.
 *
 * Ступени и подписи под ними берутся из одного списка. До этого легенда была
 * набрана отдельно и осталась на прежних цветах, когда лестница поменялась:
 * клетка и её пояснение показывали разные оттенки одного процента. Подписи
 * при этом читались накопительно («≥60%»), а ступени были непересекающимися
 * диапазонами — то же расхождение, что уже ловили на «Последнем входе».
 */
// Ступени заливки — прозрачностью одного зелёного, а не шестью разными.
//
// Раньше три средние ступени были заданы светлыми оттенками числом. На светлой
// теме это работало, а на тёмной такая клетка осталась бы светлым пятном, и
// подпись «до 20%» цветом var(--positive) — светло-зелёная на светло-зелёном —
// перестала бы читаться. Прозрачность решает обе темы сразу: под ней своя
// поверхность, и контраст с текстом сохраняется.
const STEPS: { upTo: number; bg: string; fg: string; label: string }[] = [
  { upTo: 0,   bg: 'var(--bg-sunken)',        fg: 'var(--ink-3)',    label: 'никто' },
  { upTo: 20,  bg: 'color-mix(in srgb, var(--positive) 12%, transparent)', fg: 'var(--positive)', label: 'до 20%' },
  { upTo: 40,  bg: 'color-mix(in srgb, var(--positive) 28%, transparent)', fg: 'var(--positive)', label: '20–40%' },
  { upTo: 60,  bg: 'color-mix(in srgb, var(--positive) 55%, transparent)', fg: '#fff',            label: '40–60%' },
  { upTo: 80,  bg: 'color-mix(in srgb, var(--positive) 78%, transparent)', fg: '#fff',            label: '60–80%' },
  { upTo: 101, bg: 'var(--positive)',         fg: '#fff',            label: '80% и выше' },
]

function stepOf(pct: number) {
  return STEPS.find(s => pct <= s.upTo) ?? STEPS[STEPS.length - 1]
}

function cellBg(pct: number | null): string {
  return pct === null ? 'transparent' : stepOf(pct).bg
}

function cellText(pct: number | null): string {
  return pct === null ? 'var(--ink-3)' : stepOf(pct).fg
}

export default function CohortsPage() {
  const fetcher = useCallback(() => fetchCohorts(), [])
  const { data: cohorts, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users', 'jm_likes', 'jm_messages'],
    intervalSec: 120,
  })

  if (loading) return <PageSkeleton rows={2} />
  if (error || !cohorts) return <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />

  const maxRet1 = cohorts.table.length > 0
    ? Math.max(...cohorts.table.map(r => r.cols[1]).filter((v): v is number => v !== null))
    : null

  return (
    <div>
      <PageHeader title="Когортный анализ" intervalSec={120} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-3">
          <KpiCard label="Когорт" value={cohorts.table.length}
            sub="недель регистрации под наблюдением" sparkColor={PALETTE.blue} />
          <KpiCard label="Всего в когортах"
            value={cohorts.table.reduce((s, r) => s + r.size, 0)}
            sub="зарегистрировались за 12 недель" sparkColor={PALETTE.purple} />
          {/* Раньше при отсутствии данных сюда шла строка «Н/Д» — карточка
              умеет показывать прочерк сама, и он отличается от нуля. */}
          <KpiCard
            label="Лучшее удержание · неделя 1"
            value={maxRet1 !== null && isFinite(maxRet1) ? `${maxRet1}%` : null}
            sub="доля вернувшихся в лучшей когорте"
            sparkColor={PALETTE.green}
          />
        </div>

        <ChartCard title="Новые пользователи по неделям" sub="12 недель">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cohorts.weeklyBar} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="square" iconSize={8} wrapperStyle={LEGEND} />
              <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
              <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Когортный анализ" sub="Удержание пользователей · % активных (лайки / сообщения)">
          <div style={{ overflowX: 'auto' }}>
            <table className="jt-table">
              <thead>
                <tr>
                  {['Неделя', 'Регистраций', 'Нед. 0', 'Нед. 1', 'Нед. 2', 'Нед. 3', 'Нед. 4'].map(col => (
                    <th key={col} style={{ textAlign: col === 'Неделя' ? 'left' : 'center' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.table.map(row => (
                  <tr key={row.label}>
                    <td className="num" style={{ fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                      {row.label}
                    </td>
                    <td className="num" style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
                      {row.size}
                    </td>
                    {row.cols.map((pct, ci) => (
                      <td key={ci} className="num" style={{
                        textAlign: 'center',
                        background: cellBg(pct),
                        color: cellText(pct),
                        fontWeight: pct !== null && pct >= 40 ? 600 : 400,
                      }}>
                        {/* Прочерк значит «эта неделя ещё не наступила», а не ноль. */}
                        {pct === null ? '—' : `${pct}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Легенда строится из того же списка, что и заливка клеток. */}
          <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Вернулись:</span>
            {STEPS.map(step => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden="true" style={{
                  width: 22, height: 14, borderRadius: 3, background: step.bg,
                  border: step.upTo === 0 ? '1px solid var(--line)' : 'none',
                }} />
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{step.label}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
