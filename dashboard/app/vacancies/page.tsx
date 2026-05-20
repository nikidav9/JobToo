'use client'
import { useCallback } from 'react'
import { fetchVacancies, PALETTE } from '@/lib/queries'
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

export default function VacanciesPage() {
  const fetcher = useCallback(() => fetchVacancies(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_vacancies', 'jm_perm_vacancies', 'jm_perm_applications'],
    intervalSec: 30,
  })

  if (loading || !d) return <Loader />

  return (
    <div>
      <PageHeader title="Вакансии" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">
        <div className="g-4">
          <KpiCard label="Врем. вакансий" value={d.kpi.totalTemp} sub={`${d.kpi.openTemp} открыто`} sparkColor={PALETTE.orange} />
          <KpiCard label="Пост. вакансий" value={d.kpi.totalPerm} sub={`${d.kpi.openPerm} открыто`} sparkColor={PALETTE.blue} />
          <KpiCard label="Срочных" value={d.kpi.urgentTemp} sparkColor={PALETTE.red} />
          <KpiCard label="Новых за месяц" value={d.kpi.newMonth} deltaTone="pos" delta={`+${d.kpi.newMonth}`} />
        </div>

        <ChartCard title="Публикация вакансий" sub="Временные и постоянные по дням · 90 дней">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d.daily90} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={8} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Area type="monotone" dataKey="temp" name="Временные" stroke={PALETTE.orange} fill="url(#gT)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="perm" name="Постоянные" stroke={PALETTE.blue} fill="url(#gP)" strokeWidth={1.7} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="g-3">
          <ChartCard title="Типы работ" sub="Временные вакансии">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.workTypeDist} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Вакансий" radius={[0, 4, 4, 0]}>
                  {d.workTypeDist.map((_, i) => <Cell key={i} fill={Object.values(PALETTE)[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Статус врем." sub="Открыто / закрыто">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={d.tempStatus} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" paddingAngle={4}>
                  {d.tempStatus.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: PALETTE.green }}>{d.kpi.openTemp}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Открыто</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: PALETTE.gray }}>{d.kpi.closedTemp}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Закрыто</div>
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Статус пост." sub="Открыто / закрыто">
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={d.permStatus} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" paddingAngle={4}>
                  {d.permStatus.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: PALETTE.green }}>{d.kpi.openPerm}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Открыто</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: PALETTE.gray }}>{d.kpi.closedPerm}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Закрыто</div>
              </div>
            </div>
          </ChartCard>
        </div>

        <PermVacancyCards cards={d.permVacancyCards} />

        <div className="g-2">
          <ChartCard title="Зарплатные диапазоны" sub="Постоянные вакансии">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.salaryDist} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Вакансий" radius={[4, 4, 0, 0]}>
                  {d.salaryDist.map((_, i) => <Cell key={i} fill={PALETTE.blue} opacity={0.5 + i * 0.1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Топ работодателей" sub="По количеству вакансий">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['Компания', 'Смены', 'Пост.', 'Всего'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500,
                      padding: '0 16px 10px 0', borderBottom: '1px solid var(--line)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.topEmployers.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 16px 9px 0', fontWeight: 500, color: 'var(--ink)' }}>{e.name}</td>
                    <td style={{ padding: '9px 16px 9px 0', color: 'var(--ink-2)' }}>{e.temp}</td>
                    <td style={{ padding: '9px 16px 9px 0', color: 'var(--ink-2)' }}>{e.perm}</td>
                    <td style={{ padding: '9px 0', fontWeight: 600, color: 'var(--accent)' }}>{e.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

type PermCard = {
  id: string
  title: string
  company: string
  metro: string | null
  salary: string | null
  status: string
  schedule: string | null
  createdAt: string | null
  apps: { total: number; pending: number; approved: number; rejected: number }
}

function PermVacancyCards({ cards }: { cards: PermCard[] }) {
  if (!cards || cards.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 12, letterSpacing: '0.01em' }}>
        Постоянные вакансии
        <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 400, color: 'var(--ink-3)' }}>
          {cards.length} всего · сортировка по откликам
        </span>
      </div>
      <div className="perm-vac-grid">
        {cards.map(c => <PermCard key={c.id} c={c} />)}
      </div>
    </div>
  )
}

function PermCard({ c }: { c: PermCard }) {
  const isOpen = c.status === 'open'
  const hasApps = c.apps.total > 0
  const approvedPct = hasApps ? Math.round(c.apps.approved / c.apps.total * 100) : 0

  return (
    <div className="perm-vac-card">
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: isOpen ? '#EBF5F0' : '#F2F1EE',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconBriefcase color={isOpen ? PALETTE.green : '#B0ADA6'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {c.title}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{c.company}</div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
          background: isOpen ? '#EBF5F0' : '#F2F1EE',
          color: isOpen ? PALETTE.green : '#9A9690',
          letterSpacing: '0.04em',
        }}>
          {isOpen ? 'ОТКРЫТА' : 'ЗАКРЫТА'}
        </span>
      </div>

      {/* meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 10 }}>
        {c.salary && (
          <span style={{ fontSize: 12, fontWeight: 600, color: PALETTE.blue }}>{c.salary}</span>
        )}
        {c.metro && (
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconMetro /> {c.metro}
          </span>
        )}
        {c.schedule && (
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c.schedule}</span>
        )}
        {c.createdAt && (
          <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>{c.createdAt}</span>
        )}
      </div>

      {/* divider */}
      <div style={{ height: 1, background: 'var(--line)', marginBottom: 10 }} />

      {/* applications row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconPeople color={hasApps ? PALETTE.blue : '#C8C5BF'} />
        <span style={{ fontSize: 18, fontWeight: 700, color: hasApps ? 'var(--ink)' : 'var(--ink-4)', lineHeight: 1 }}>
          {c.apps.total}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', marginRight: 'auto' }}>
          {c.apps.total === 1 ? 'отклик' : c.apps.total >= 2 && c.apps.total <= 4 ? 'отклика' : 'откликов'}
        </span>
        {hasApps && (
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill color={PALETTE.amber} label="ожид." value={c.apps.pending} />
            <Pill color={PALETTE.green} label="одобр." value={c.apps.approved} />
            <Pill color={PALETTE.red} label="откл." value={c.apps.rejected} />
          </div>
        )}
      </div>

      {/* progress bar */}
      {hasApps && (
        <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: '#F0EEE9', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: PALETTE.green,
            width: `${approvedPct}%`,
            transition: 'width 0.4s',
          }} />
        </div>
      )}
    </div>
  )
}

function Pill({ color, label, value }: { color: string; label: string; value: number }) {
  if (value === 0) return null
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
      background: color + '18', color,
    }}>
      {value} {label}
    </span>
  )
}

function IconBriefcase({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="12.01" />
    </svg>
  )
}

function IconMetro() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9A9690" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6 8 18M12 6l4 12M8 14h8" />
    </svg>
  )
}

function IconPeople({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
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
