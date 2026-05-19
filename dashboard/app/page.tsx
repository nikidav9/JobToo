'use client'
import { useCallback } from 'react'
import { fetchOverview, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

export default function OverviewPage() {
  const fetcher = useCallback(() => fetchOverview(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users', 'jm_vacancies', 'jm_perm_vacancies', 'jm_likes'],
    intervalSec: 30,
  })

  if (loading || !d) return <PageLoader />

  return (
    <div>
      <PageHeader title="Обзор" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">

        {/* Main KPIs */}
        <div className="g-4">
          <KpiCard label="Всего пользователей" value={d.kpi.totalUsers}
            sub={`+${d.kpi.newUsersWeek} за 7 дней`}
            delta={d.kpi.trendUsers ? `+${d.kpi.trendUsers}%` : undefined} deltaTone="pos" />
          <KpiCard label="Вакансии" value={d.kpi.tempVacancies + d.kpi.permVacancies}
            sub={`${d.kpi.openTemp + d.kpi.openPerm} открыто`} sparkColor={PALETTE.green} />
          <KpiCard label="Совпадений" value={d.kpi.totalMatches}
            sub={`${d.kpi.matchRate}% конверсия`}
            delta={d.kpi.trendMatches ? `+${d.kpi.trendMatches}%` : undefined} deltaTone="pos" />
          <KpiCard label="Средний рейтинг" value={d.kpi.avgRating}
            sub={`${d.kpi.chats} чатов`} sparkColor={PALETTE.amber} />
        </div>

        {/* Secondary KPIs */}
        <div className="g-4">
          <KpiCard label="Работники" value={d.kpi.workers}
            sub={`${Math.round(d.kpi.workers / Math.max(d.kpi.totalUsers, 1) * 100)}% базы`}
            sparkColor={PALETTE.orange} />
          <KpiCard label="Работодатели" value={d.kpi.employers}
            sub={`${Math.round(d.kpi.employers / Math.max(d.kpi.totalUsers, 1) * 100)}% базы`}
            sparkColor={PALETTE.blue} />
          <KpiCard label="Лайков" value={d.kpi.totalLikes} sparkColor={PALETTE.pink} />
          <KpiCard label="Подтверждено" value={d.kpi.confirmed} sparkColor={PALETTE.green} />
        </div>

        {/* Charts */}
        <div className="g-14">
          <ChartCard title="Регистрации по дням" sub="Работники и работодатели · 30 дней">
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={d.dailyUsers} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                <Area type="monotone" dataKey="workers" name="Работники" stroke={PALETTE.orange} fill="url(#gW)" strokeWidth={1.7} dot={false} />
                <Area type="monotone" dataKey="employers" name="Работодатели" stroke={PALETTE.blue} fill="url(#gE)" strokeWidth={1.7} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ChartCard title="Пользователи" sub="Роли">
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie data={[
                    { name: 'Работники', value: d.kpi.workers, fill: PALETTE.orange },
                    { name: 'Работодатели', value: d.kpi.employers, fill: PALETTE.blue },
                  ]} cx="50%" cy="50%" innerRadius={32} outerRadius={46} dataKey="value" paddingAngle={3}>
                    <Cell fill={PALETTE.orange} />
                    <Cell fill={PALETTE.blue} />
                  </Pie>
                  <Tooltip contentStyle={TT} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Вакансии и совпадения" sub="30 дней">
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={d.dailyVacs.slice(-14)} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PALETTE.green} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.green} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PALETTE.purple} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.purple} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TT} />
                  <Area type="monotone" dataKey="vacancies" name="Вакансии" stroke={PALETTE.green} fill="url(#gV)" strokeWidth={1.7} dot={false} />
                  <Area type="monotone" dataKey="matches" name="Совпадения" stroke={PALETTE.purple} fill="url(#gM)" strokeWidth={1.7} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        {/* Funnel + work types */}
        <div className="g-2">
          <ChartCard title="Воронка" sub="От лайка до завершения смены">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              {d.funnel.map((item, i) => {
                const pct = d.funnel[0].value > 0 ? (item.value / d.funnel[0].value) * 100 : 0
                const drop = i > 0 && d.funnel[i - 1].value > 0
                  ? Math.round((1 - item.value / d.funnel[i - 1].value) * 100) : null
                const colors = [PALETTE.blue, PALETTE.cyan, PALETTE.purple, PALETTE.orange, PALETTE.green]
                return (
                  <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 4 }}>{item.name}</div>
                      <div style={{ height: 22, background: 'var(--bg-sunken)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.max(pct, 3)}%`, height: '100%',
                          background: colors[i], borderRadius: 4,
                          display: 'flex', alignItems: 'center', paddingLeft: 8,
                        }}>
                          <span style={{ color: '#fff', fontSize: 11, fontFamily: 'Geist Mono, monospace' }}>
                            {item.value.toLocaleString('ru')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: drop ? 'var(--negative)' : 'var(--ink-4)', fontFamily: 'Geist Mono, monospace', width: 40, textAlign: 'right' }}>
                      {drop ? `−${drop}%` : '100%'}
                    </div>
                  </div>
                )
              })}
            </div>
          </ChartCard>

          <ChartCard title="Типы работ" sub="Временные вакансии">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.workTypeDist} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Вакансий" radius={[0, 4, 4, 0]}>
                  {d.workTypeDist.map((_, i) => <Cell key={i} fill={Object.values(PALETTE)[i % 8]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 72 : 140, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
