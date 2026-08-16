'use client'
import { useCallback } from 'react'
import { fetchQuality, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import PageSkeleton from '@/components/PageSkeleton'
import Donut from '@/components/Donut'
import Chip from '@/components/Chip'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { AXIS, GRID, LEGEND, TT } from '@/lib/chart'


export default function QualityPage() {
  const fetcher = useCallback(() => fetchQuality(), [])
  const { data: d, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_ratings', 'jm_complaints', 'jm_perm_applications'],
    intervalSec: 60,
  })

  if (loading) return <PageSkeleton rows={3} />
  if (error || !d) return <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />

  const ratingNum = Number(d.kpi.avgRating)
  const ratingColor = ratingNum >= 4 ? PALETTE.green : ratingNum >= 3 ? PALETTE.amber : PALETTE.red

  return (
    <div>
      <PageHeader title="Качество" intervalSec={60} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-5">
          {/* При нуле оценок средние приходят нулями. Ноль и «оценок ещё не
              было» — разные сообщения, и второе здесь правда. */}
          <KpiCard label="Средний рейтинг"
            value={d.kpi.totalRatings > 0 ? d.kpi.avgRating : null}
            sub={d.kpi.totalRatings > 0 ? `по ${d.kpi.totalRatings} оценкам` : 'оценок пока нет'}
            sparkColor={ratingColor} />
          <KpiCard label="Оценки работникам"
            value={d.kpi.totalRatings > 0 ? d.kpi.avgWorkerRating : null}
            sub="ставят работодатели" sparkColor={PALETTE.orange} />
          <KpiCard label="Оценки работодателям"
            value={d.kpi.totalRatings > 0 ? d.kpi.avgEmployerRating : null}
            sub="ставят работники" sparkColor={PALETTE.blue} />
          <KpiCard label="Всего оценок" value={d.kpi.totalRatings} sub="за всё время" sparkColor={PALETTE.purple} />
          <KpiCard label="Жалоб всего" value={d.kpi.totalComplaints}
            sub={`${d.kpi.workerComplaints} на работников · ${d.kpi.employerComplaints} на работодателей`}
            sparkColor={PALETTE.red} />
        </div>

        <div className="g-3">
          <KpiCard label="Заявок на постоянные" value={d.kpi.totalApplications}
            sub="за всё время" sparkColor={PALETTE.cyan} />
          <KpiCard label="Ожидают ответа" value={d.kpi.pendingApplications}
            sub={d.kpi.totalApplications ? `${Math.round(d.kpi.pendingApplications / d.kpi.totalApplications * 100)}% заявок` : '—'}
            sparkColor={PALETTE.amber} />
          <KpiCard label="Одобрено"
            value={d.appStatus.find((a: any) => a.name === 'Одобрено')?.value ?? 0}
            sub={d.kpi.totalApplications ? `${Math.round(((d.appStatus.find((a: any) => a.name === 'Одобрено')?.value ?? 0) / d.kpi.totalApplications) * 100)}% заявок` : '—'}
            sparkColor={PALETTE.green} />
        </div>

        <div className="g-2">
          <ChartCard title="Распределение оценок" sub="Сколько каких оценок поставили · 1–5 звёзд">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.ratingDist} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="square" iconSize={8} wrapperStyle={LEGEND} />
                <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
                <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Средний рейтинг по дням" sub="30 дней">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={d.ratingTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
                <YAxis domain={[0, 5]} tick={AXIS} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TT} formatter={(v: any) => [v ? Number(v).toFixed(2) : '—', 'Рейтинг']} />
                <ReferenceLine y={4} stroke={PALETTE.green} strokeDasharray="4 2" label={{ value: '4.0', fill: PALETTE.green, fontSize: 10 }} />
                <ReferenceLine y={3} stroke={PALETTE.amber} strokeDasharray="4 2" label={{ value: '3.0', fill: PALETTE.amber, fontSize: 10 }} />
                <Line type="monotone" dataKey="avg" name="Ср. рейтинг" stroke={ratingColor} strokeWidth={2} dot={{ r: 2.5, fill: ratingColor }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="g-3">
          {/* Числа под кольцом повторяли то же, что легенда: два одинаковых
              счётчика на одной карточке. Оставлено одно место. */}
          <ChartCard title="Жалобы" sub="На кого жалуются">
            <Donut
              data={d.complaintSplit.map((e: any) => ({ name: e.name, value: e.value, color: e.fill }))}
              caption="жалоб"
            />
          </ChartCard>

          <ChartCard title="Жалобы по дням" sub="30 дней">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.complaintTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="count" name="Жалобы" fill={PALETTE.red} opacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Заявки на постоянные" sub="По статусу">
            <Donut
              data={d.appStatus.map((e: any) => ({ name: e.name, value: e.value, color: e.fill }))}
              caption="заявок"
            />
          </ChartCard>
        </div>

        {d.recentComplaints.length > 0 && (
          <ChartCard title="Последние жалобы" sub={`${d.kpi.totalComplaints} всего`}>
            <div style={{ overflowX: 'auto' }}>
              <table className="jt-table">
                <thead>
                  <tr>
                    {['На кого жалуются', 'От кого', 'На кого', 'Описание', 'Дата'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.recentComplaints.map((c: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <Chip tone={c.type === 'worker' ? 'accent' : 'info'}>
                          {c.type === 'worker' ? 'Работник' : 'Работодатель'}
                        </Chip>
                      </td>
                      <td className="num" style={{ color: 'var(--ink-2)', fontSize: 12 }}>{c.reporter}</td>
                      <td className="num" style={{ color: 'var(--ink-2)', fontSize: 12 }}>{c.target}</td>
                      <td style={{ color: 'var(--ink-2)', maxWidth: 240 }}>{c.desc}</td>
                      <td className="num" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{c.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  )
}


function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--negative)"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5L21.5 20H2.5L12 3.5z" /><path d="M12 10v4M12 17h.01" />
      </svg>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Не удалось загрузить данные</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'Geist Mono, monospace', maxWidth: 400, textAlign: 'center' }}>{message}</div>
      <button onClick={onRetry} className="jt-btn jt-btn-secondary" style={{ marginTop: 8 }}>
        Повторить
      </button>
    </div>
  )
}
