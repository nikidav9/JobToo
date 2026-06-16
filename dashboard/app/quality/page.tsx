'use client'
import { useCallback } from 'react'
import { fetchQuality, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

export default function QualityPage() {
  const fetcher = useCallback(() => fetchQuality(), [])
  const { data: d, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_ratings', 'jm_complaints', 'jm_perm_applications'],
    intervalSec: 60,
  })

  if (loading) return <Loader />
  if (error || !d) return <ErrorState message={error ?? 'Нет данных'} onRetry={refresh} />

  const ratingNum = Number(d.kpi.avgRating)
  const ratingColor = ratingNum >= 4 ? PALETTE.green : ratingNum >= 3 ? PALETTE.amber : PALETTE.red

  return (
    <div>
      <PageHeader title="Качество" intervalSec={60} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-5">
          <KpiCard label="Средний рейтинг" value={d.kpi.avgRating} sub="Все оценки" sparkColor={ratingColor} />
          <KpiCard label="Рейтинг работников" value={d.kpi.avgWorkerRating} sparkColor={PALETTE.orange} />
          <KpiCard label="Рейтинг работодат." value={d.kpi.avgEmployerRating} sparkColor={PALETTE.blue} />
          <KpiCard label="Всего оценок" value={d.kpi.totalRatings} sparkColor={PALETTE.purple} />
          <KpiCard label="Жалоб всего" value={d.kpi.totalComplaints}
            sub={`${d.kpi.workerComplaints} рабочих · ${d.kpi.employerComplaints} работодат.`}
            sparkColor={PALETTE.red} />
        </div>

        <div className="g-3">
          <KpiCard label="Заявок (пост.)" value={d.kpi.totalApplications} sparkColor={PALETTE.cyan} />
          <KpiCard label="Ожидает" value={d.kpi.pendingApplications} sparkColor={PALETTE.amber} />
          <KpiCard label="Одобрено" value={d.appStatus.find(a => a.name === 'Одобрено')?.value ?? 0} sparkColor={PALETTE.green} />
        </div>

        <div className="g-2">
          <ChartCard title="Распределение оценок" sub="Работники и работодатели">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.ratingDist} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
                <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Средний рейтинг по дням" sub="30 дней">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={d.ratingTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
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
          <ChartCard title="Жалобы" sub="По типу">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={d.complaintSplit} cx="50%" cy="50%" innerRadius={44} outerRadius={64} dataKey="value" paddingAngle={4}>
                  {d.complaintSplit.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 6 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: PALETTE.orange }}>{d.kpi.workerComplaints}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>На работников</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: PALETTE.blue }}>{d.kpi.employerComplaints}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>На работодат.</div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Жалобы по дням" sub="30 дней">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.complaintTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="count" name="Жалобы" fill={PALETTE.red} opacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Заявки (пост. вакансии)" sub="По статусу">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={d.appStatus} cx="50%" cy="50%" innerRadius={44} outerRadius={64} dataKey="value" paddingAngle={4}>
                  {d.appStatus.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
              {d.appStatus.map(a => (
                <div key={a.name} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: a.fill }}>{a.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{a.name}</div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {d.recentComplaints.length > 0 && (
          <ChartCard title="Последние жалобы" sub={`${d.kpi.totalComplaints} всего`}>
            <div style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['Тип', 'От кого', 'На кого', 'Описание', 'Дата'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500,
                        padding: '8px 16px', borderBottom: '1px solid var(--line)',
                        background: 'var(--bg)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.recentComplaints.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: 5, fontSize: 11,
                          color: c.type === 'worker' ? 'var(--accent)' : 'var(--info)',
                          background: c.type === 'worker' ? 'var(--accent-soft)' : 'rgba(59,91,181,.08)',
                        }}>
                          {c.type === 'worker' ? 'Работник' : 'Работодат.'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink-3)', fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{c.reporter}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink-3)', fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{c.target}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink-2)', fontSize: 12, maxWidth: 240 }}>{c.desc}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{c.date}</td>
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

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ height: 120, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Не удалось загрузить данные</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'Geist Mono, monospace', maxWidth: 400, textAlign: 'center' }}>{message}</div>
      <button onClick={onRetry} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer' }}>
        Повторить
      </button>
    </div>
  )
}
