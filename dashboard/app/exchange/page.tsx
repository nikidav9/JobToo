'use client'
import { useCallback } from 'react'
import { fetchExchange, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

export default function ExchangePage() {
  const fetcher = useCallback(() => fetchExchange(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_bulletins', 'jm_worker_slots', 'jm_chats'],
    intervalSec: 30,
  })

  if (loading || !d) return <Loader />

  return (
    <div>
      <PageHeader title="Биржа" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">

        {/* KPI row 1 — bulletins & responses */}
        <div className="g-4">
          <KpiCard
            label="Всего объявлений"
            value={d.kpi.totalBulletins}
            sub={`${d.kpi.openBulletins} открыто · ${d.kpi.closedBulletins} закрыто`}
            sparkColor={PALETTE.orange}
            delta={d.kpi.bulletinsTrend !== 0 ? `${d.kpi.bulletinsTrend > 0 ? '+' : ''}${d.kpi.bulletinsTrend}%` : undefined}
            deltaTone={d.kpi.bulletinsTrend > 0 ? 'pos' : d.kpi.bulletinsTrend < 0 ? 'neg' : undefined}
          />
          <KpiCard
            label="Откликов (чатов)"
            value={d.kpi.totalChats}
            sub={`+${d.kpi.newChatsMonth} за месяц`}
            sparkColor={PALETTE.blue}
            delta={d.kpi.chatsTrend !== 0 ? `${d.kpi.chatsTrend > 0 ? '+' : ''}${d.kpi.chatsTrend}%` : undefined}
            deltaTone={d.kpi.chatsTrend > 0 ? 'pos' : d.kpi.chatsTrend < 0 ? 'neg' : undefined}
          />
          <KpiCard
            label="Просмотров объявлений"
            value={d.kpi.totalViews}
            sub={`ср. ${d.kpi.avgViews} на объявление`}
            sparkColor={PALETTE.cyan}
          />
          <KpiCard
            label="Слотов работников"
            value={d.kpi.totalSlots}
            sub={`${d.kpi.openSlots} открыто · ${d.kpi.closedSlots} закрыто`}
            sparkColor={PALETTE.green}
            delta={d.kpi.slotsTrend !== 0 ? `${d.kpi.slotsTrend > 0 ? '+' : ''}${d.kpi.slotsTrend}%` : undefined}
            deltaTone={d.kpi.slotsTrend > 0 ? 'pos' : d.kpi.slotsTrend < 0 ? 'neg' : undefined}
          />
        </div>

        {/* KPI row 2 — quality */}
        <div className="g-4">
          <KpiCard
            label="Конверсия просм.→отклик"
            value={`${d.kpi.conversionPct}%`}
            sub="от всех просмотров"
            sparkColor={PALETTE.purple}
          />
          <KpiCard
            label="Ср. откликов на объявление"
            value={d.kpi.avgResponses}
            sub="среднее по всем объявлениям"
            sparkColor={PALETTE.blue}
          />
          <KpiCard
            label="Без откликов"
            value={`${d.kpi.zeroResponsePct}%`}
            sub={`${d.kpi.zeroResponseBulletins} объявлений без интереса`}
            sparkColor={PALETTE.red}
          />
          <KpiCard
            label="Новых за месяц"
            value={d.kpi.newBulletinsMonth}
            sub={`+ ${d.kpi.newSlotsMonth} слотов за месяц`}
            sparkColor={PALETTE.amber}
          />
        </div>

        {/* Daily activity chart */}
        <ChartCard title="Активность биржи" sub="Объявления, отклики и слоты · 30 дней">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d.daily30} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gBl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gSl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.green} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={PALETTE.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Area type="monotone" dataKey="bulletins" name="Объявления" stroke={PALETTE.orange} fill="url(#gBl)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="responses" name="Отклики" stroke={PALETTE.blue} fill="url(#gCh)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="slots" name="Слоты" stroke={PALETTE.green} fill="url(#gSl)" strokeWidth={1.7} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Week comparison */}
        <ChartCard title="Эта неделя vs прошлая" sub="Объявления · отклики · слоты">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={d.weekComparison} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Bar dataKey="thisWeek" name="Эта неделя" fill={PALETTE.orange} radius={[4, 4, 0, 0]} />
              <Bar dataKey="lastWeek" name="Прошлая неделя" fill="#E8E6DF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Funnel + Weekday distribution */}
        <div className="g-2">
          <ChartCard title="Воронка" sub="Просмотры → Отклики → Уникальных работников">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.funnelData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Кол-во" radius={[4, 4, 0, 0]}>
                  {d.funnelData.map((_: any, i: number) => (
                    <Cell key={i} fill={[PALETTE.cyan, PALETTE.blue, PALETTE.purple][i] ?? PALETTE.gray} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Дни недели" sub="Объявления по дням недели">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.weekdayDist} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Объявлений" radius={[4, 4, 0, 0]}>
                  {d.weekdayDist.map((item: any, i: number) => (
                    <Cell key={i} fill={item.name === 'Сб' || item.name === 'Вс' ? PALETTE.amber : PALETTE.orange} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Hour distribution */}
        {d.hourDist.length > 0 && (
          <ChartCard title="Популярные часы смен" sub="Распределение начала работы (time_start)">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.hourDist} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="hour" tick={AXIS} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Объявлений" fill={PALETTE.purple} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Work type distributions */}
        <div className="g-2">
          <ChartCard title="Типы работ — объявления" sub="По работодателям">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.workTypeDist} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={90} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Объявлений" radius={[0, 4, 4, 0]}>
                  {d.workTypeDist.map((_: any, i: number) => <Cell key={i} fill={Object.values(PALETTE)[i % Object.values(PALETTE).length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Типы работ — слоты работников" sub="По предложениям от работников">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.slotWorkTypeDist} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={90} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Слотов" radius={[0, 4, 4, 0]}>
                  {d.slotWorkTypeDist.map((_: any, i: number) => <Cell key={i} fill={Object.values(PALETTE)[i % Object.values(PALETTE).length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Metro distributions */}
        <div className="g-2">
          <ChartCard title="Топ станций — объявления" sub="По числу объявлений работодателей">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.metroTop} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Объявлений" fill={PALETTE.purple} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Топ станций — слоты" sub="По числу слотов работников">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.slotMetroTop} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="value" name="Слотов" fill={PALETTE.green} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Top employers table */}
        <ChartCard title="Топ работодателей" sub="По числу объявлений на бирже">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 540 }}>
              <thead>
                <tr>
                  {['#', 'Компания', 'Объявлений', 'Просмотров', 'Откликов', 'Конверсия'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase',
                      letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500,
                      padding: '0 16px 10px 0', borderBottom: '1px solid var(--line)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.topEmployers.map((e: any, i: number) => {
                  const conv = e.views > 0 ? ((e.responses / e.views) * 100).toFixed(0) + '%' : '—'
                  const convColor = e.views > 0
                    ? (e.responses / e.views) > 0.1 ? PALETTE.green : (e.responses / e.views) > 0.05 ? PALETTE.amber : PALETTE.red
                    : 'var(--ink-3)'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '9px 16px 9px 0', color: 'var(--ink-4)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ padding: '9px 16px 9px 0', fontWeight: 600, color: 'var(--ink)' }}>{e.name}</td>
                      <td style={{ padding: '9px 16px 9px 0', color: 'var(--ink-2)' }}>{e.bulletins}</td>
                      <td style={{ padding: '9px 16px 9px 0', color: 'var(--ink-2)' }}>{e.views}</td>
                      <td style={{ padding: '9px 16px 9px 0', color: 'var(--ink-2)' }}>{e.responses}</td>
                      <td style={{ padding: '9px 0', fontWeight: 700, color: convColor }}>{conv}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {/* Bulletin cards */}
        <BulletinCards cards={d.bulletinCards} />
      </div>
    </div>
  )
}

type BulletinCardData = {
  id: string
  company: string
  workType: string
  date: string
  timeStart: string
  timeEnd: string
  metro: string
  status: string
  views: number
  responses: number
  createdAt: string
}

function BulletinCards({ cards }: { cards: BulletinCardData[] }) {
  if (!cards || cards.length === 0) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          Объявления биржи
          <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 400, color: 'var(--ink-3)' }}>
            {cards.length} всего · сортировка по откликам
          </span>
        </div>
      </div>
      <div className="perm-vac-grid">
        {cards.map(c => <BulletinCard key={c.id} c={c} />)}
      </div>
    </div>
  )
}

function BulletinCard({ c }: { c: BulletinCardData }) {
  const isOpen = c.status === 'open'
  const hasResp = c.responses > 0
  const ctr = c.views > 0 ? ((c.responses / c.views) * 100).toFixed(0) + '%' : '—'

  return (
    <div className="perm-vac-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: isOpen ? '#FFF3EC' : '#F2F1EE',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconMegaphone color={isOpen ? PALETTE.orange : '#B0ADA6'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{c.workType}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{c.company}</div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
          background: isOpen ? '#FFF3EC' : '#F2F1EE',
          color: isOpen ? PALETTE.orange : '#9A9690',
          letterSpacing: '0.04em',
        }}>
          {isOpen ? 'ОТКРЫТО' : 'ЗАКРЫТО'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, padding: '8px 10px', background: 'var(--bg-sunken)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <IconCalendar />
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.date}</span>
          <span style={{ color: 'var(--ink-3)' }}>{c.timeStart}{c.timeEnd ? ` – ${c.timeEnd}` : ''}</span>
        </div>
        {c.metro && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>
            <IconMetro />
            <span>м. {c.metro}</span>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--line)', marginBottom: 10 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconChat color={hasResp ? PALETTE.blue : '#C8C5BF'} />
          <span style={{ fontSize: 16, fontWeight: 700, color: hasResp ? 'var(--ink)' : 'var(--ink-4)' }}>{c.responses}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>откл.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconEye color="#B0ADA6" />
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.views}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>просм.</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
          CTR <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{ctr}</span>
        </div>
        {c.createdAt && (
          <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>{c.createdAt}</span>
        )}
      </div>
    </div>
  )
}

function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B6760" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
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

function IconMegaphone({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 4L12 12 2 4" /><path d="M3 4h18v16H3z" />
    </svg>
  )
}

function IconChat({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconEye({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: 120, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
