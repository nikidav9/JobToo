'use client'
import { useCallback } from 'react'
import { fetchGeo, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { AXIS, GRID, LEGEND, TT } from '@/lib/chart'


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

export default function GeoPage() {
  const fetcher = useCallback(() => fetchGeo(), [])
  const { data: d, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users', 'jm_vacancies'],
    intervalSec: 120,
  })

  if (loading) return <Loader />
  if (error || !d) return <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />

  const userChartHeight = Math.max(200, d.userMetroTop.length * 32)
  const vacChartHeight = Math.max(200, d.vacMetroTop.length * 32)

  return (
    <div>
      <PageHeader title="Гео" intervalSec={120} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-3">
          <KpiCard label="Всего пользователей" value={d.kpi.totalUsers} sparkColor={PALETTE.blue} />
          <KpiCard label="Указали метро" value={`${d.kpi.withMetro} (${d.kpi.metroFill}%)`} sparkColor={PALETTE.orange} />
          <KpiCard label="Уникальных станций" value={d.kpi.uniqueStations} sparkColor={PALETTE.purple} />
        </div>

        <div className="g-3">
          <KpiCard label="Всего вакансий" value={d.kpi.totalVacancies} sparkColor={PALETTE.green} />
          <KpiCard label="Вакансий с метро" value={d.kpi.vacsWithMetro} sparkColor={PALETTE.cyan} />
          <KpiCard label="Без метро (юзеры)" value={d.kpi.withoutMetro} sparkColor={PALETTE.amber} />
        </div>

        {d.userMetroTop.length === 0 ? (
          <div style={{
            padding: '24px 20px',
            background: 'var(--bg-elev)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--line)',
            color: 'var(--ink-3)',
            fontSize: 13,
            textAlign: 'center',
          }}>
            Данные о метро отсутствуют — попросите пользователей указать станцию метро в профиле
          </div>
        ) : (
          <ChartCard title="Топ станций по пользователям" sub="Работники и работодатели">
            <ResponsiveContainer width="100%" height={userChartHeight}>
              <BarChart
                data={d.userMetroTop}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <YAxis dataKey="station" type="category" width={120} tick={{ ...AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="square" iconSize={8} wrapperStyle={LEGEND} />
                <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
                <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {d.vacMetroTop.length > 0 && (
          <ChartCard title="Топ станций по вакансиям" sub={`${d.kpi.vacsWithMetro} вакансий с метро`}>
            <ResponsiveContainer width="100%" height={vacChartHeight}>
              <BarChart
                data={d.vacMetroTop}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <YAxis dataKey="station" type="category" width={120} tick={{ ...AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
                <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Вакансии" fill={PALETTE.green} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    </div>
  )
}
