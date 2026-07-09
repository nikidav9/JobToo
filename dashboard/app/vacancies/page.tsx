'use client'
import { useCallback, useState } from 'react'
import { fetchVacancies, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import { updateTempVacancy, updatePermVacancy, deleteVacancy, deletePermVacancy, setVacancyStatus, setPermVacancyStatus } from '@/lib/admin-actions'
import { downloadCSV } from '@/lib/csv-export'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

export default function VacanciesPage() {
  const fetcher = useCallback(() => fetchVacancies(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_vacancies', 'jm_perm_vacancies', 'jm_perm_applications', 'jm_vacancy_views', 'jm_perm_vacancy_views'],
    intervalSec: 30,
  })

  function exportTempCSV() {
    if (!d) return
    const rows = d.tempVacancyCards.map((c: any) => ({
      Название: c.title,
      Компания: c.company,
      Статус: c.status,
      Срочно: c.isUrgent ? 'Да' : 'Нет',
      Зарплата: c.salary || '',
      Дата: c.shiftDate || '',
      Начало: c.timeStart || '',
      Конец: c.timeEnd || '',
      Адрес: c.address || '',
      Метро: c.metro || '',
      'Нужно работников': c.workersNeeded || '',
      'Найдено работников': c.workersFound || 0,
      'Откликов': c.apps.total,
      'Совпадений': c.apps.matched,
      Опубликовано: c.createdAt || '',
    }))
    downloadCSV(rows, `temp_vacancies_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportPermCSV() {
    if (!d) return
    const rows = d.permVacancyCards.map((c: any) => ({
      Название: c.title,
      Компания: c.company,
      Статус: c.status,
      Зарплата: c.salary || '',
      Метро: c.metro || '',
      График: c.schedule || '',
      Откликов: c.apps.total,
      Ожидает: c.apps.pending,
      Принято: c.apps.approved,
      Отклонено: c.apps.rejected,
      Опубликовано: c.createdAt || '',
    }))
    downloadCSV(rows, `perm_vacancies_${new Date().toISOString().slice(0, 10)}.csv`)
  }

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

        <ChartCard
          title="Просмотры вакансий"
          sub={`Уникальные просмотры по дням · 30 дней · за неделю: ${d.viewsKpi.temp7} у смен, ${d.viewsKpi.perm7} у постоянных`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={d.viewsDaily30} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gVT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.amber} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.amber} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gVP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.cyan} stopOpacity={0.2} /><stop offset="95%" stopColor={PALETTE.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Area type="monotone" dataKey="temp" name="Смены (подработки)" stroke={PALETTE.amber} fill="url(#gVT)" strokeWidth={1.7} dot={false} />
              <Area type="monotone" dataKey="perm" name="Постоянные" stroke={PALETTE.cyan} fill="url(#gVP)" strokeWidth={1.7} dot={false} />
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

        <TempVacancyCards cards={d.tempVacancyCards} onExport={exportTempCSV} onRefresh={refresh} />

        <PermVacancyCards cards={d.permVacancyCards} onExport={exportPermCSV} onRefresh={refresh} />

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

type AppInfo = { id: string; name: string; phone: string; status: string; date: string }

// ─── Временные вакансии ────────────────────────────────────────────────────

type TempCardData = {
  id: string
  title: string
  company: string
  salary: string | null
  status: string
  isUrgent: boolean
  workersNeeded: number | null
  workersFound: number
  shiftDate: string | null
  timeStart: string | null
  timeEnd: string | null
  address: string | null
  metro: string | null
  createdAt: string | null
  apps: { total: number; matched: number; pending: number; rejected: number }
  applicants: AppInfo[]
}

function TempVacancyCards({ cards, onExport, onRefresh }: { cards: TempCardData[]; onExport: () => void; onRefresh: () => void }) {
  if (!cards || cards.length === 0) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          Временные вакансии
          <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 400, color: 'var(--ink-3)' }}>
            {cards.length} всего · сортировка по откликам
          </span>
        </div>
        <button onClick={onExport} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 13h10"/></svg>
          CSV
        </button>
      </div>
      <div className="perm-vac-grid">
        {cards.map(c => <TempCard key={c.id} c={c} onRefresh={onRefresh} />)}
      </div>
    </div>
  )
}

function TempCard({ c, onRefresh }: { c: TempCardData; onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editFields, setEditFields] = useState({
    status: c.status as 'open' | 'closed',
    is_urgent: c.isUrgent,
    address: c.address ?? '',
    metro_station: c.metro ?? '',
    date: c.shiftDate ?? '',
    time_start: c.timeStart ?? '',
    time_end: c.timeEnd ?? '',
    salary: c.salary ? c.salary.replace(/[^\d]/g, '') : '',
    workers_needed: c.workersNeeded ? String(c.workersNeeded) : '',
  })

  async function handleSave() {
    setSaving(true)
    try {
      await updateTempVacancy(c.id, {
        status: editFields.status,
        is_urgent: editFields.is_urgent,
        address: editFields.address || undefined,
        metro_station: editFields.metro_station || undefined,
        date: editFields.date || undefined,
        time_start: editFields.time_start || undefined,
        time_end: editFields.time_end || undefined,
        salary: editFields.salary ? Number(editFields.salary) : null,
        workers_needed: editFields.workers_needed ? Number(editFields.workers_needed) : null,
      })
      setEditing(false)
      onRefresh()
    } catch { } finally { setSaving(false) }
  }

  const isOpen = editing ? editFields.status === 'open' : c.status === 'open'
  const hasApps = c.apps.total > 0
  const matchedPct = hasApps ? Math.round(c.apps.matched / c.apps.total * 100) : 0

  const matched  = c.applicants.filter(a => a.status === 'matched')
  const pending  = c.applicants.filter(a => a.status === 'pending')
  const rejected = c.applicants.filter(a => a.status === 'rejected')

  return (
    <div className="perm-vac-card">
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: isOpen ? '#FFF3EC' : '#F2F1EE',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconBriefcase color={isOpen ? PALETTE.orange : '#B0ADA6'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {c.title}
            {(editing ? editFields.is_urgent : c.isUrgent) && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: PALETTE.red, background: PALETTE.red + '15', padding: '1px 5px', borderRadius: 4 }}>СРОЧНО</span>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{c.company}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={() => setEditing(e => !e)} style={{
            fontSize: 10.5, padding: '2px 7px', borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer',
            background: editing ? 'var(--ink)' : 'var(--bg-sunken)', color: editing ? '#fff' : 'var(--ink-3)',
          }}>✏️</button>
          <span style={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: isOpen ? '#FFF3EC' : '#F2F1EE',
            color: isOpen ? PALETTE.orange : '#9A9690',
            letterSpacing: '0.04em',
          }}>
            {isOpen ? 'ОТКРЫТА' : 'ЗАКРЫТА'}
          </span>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div style={{ marginBottom: 12, padding: '12px', background: 'var(--bg-sunken)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <span style={{ color: 'var(--ink-3)' }}>Статус:</span>
              <select value={editFields.status} onChange={e => setEditFields(f => ({ ...f, status: e.target.value as any }))}
                style={{ height: 28, padding: '0 6px', border: '1px solid var(--line)', borderRadius: 5, background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}>
                <option value="open">Открыта</option>
                <option value="closed">Закрыта</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={editFields.is_urgent} onChange={e => setEditFields(f => ({ ...f, is_urgent: e.target.checked }))} />
              <span>Срочно</span>
            </label>
          </div>
          {[
            ['Адрес', 'address'],
            ['Метро', 'metro_station'],
            ['Дата смены', 'date'],
            ['Начало', 'time_start'],
            ['Конец', 'time_end'],
            ['Зарплата', 'salary'],
            ['Нужно чел.', 'workers_needed'],
          ].map(([label, key]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--ink-3)', minWidth: 80 }}>{label}</span>
              <input
                value={(editFields as any)[key]}
                onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
                style={{ flex: 1, height: 28, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 5, background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ height: 30, padding: '0 14px', borderRadius: 6, border: 'none', background: 'var(--positive)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
              {saving ? '…' : '✓ Сохранить'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ height: 30, padding: '0 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', fontSize: 12.5, cursor: 'pointer' }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* meta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 10 }}>
        {c.salary && <span style={{ fontSize: 12, fontWeight: 600, color: PALETTE.blue }}>{c.salary}</span>}
        {c.workersNeeded && (
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            {c.workersFound}/{c.workersNeeded} найдено
          </span>
        )}
        {c.createdAt && <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>Опубл. {c.createdAt}</span>}
      </div>

      {/* shift info row */}
      {(c.shiftDate || c.address || c.metro) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, padding: '8px 10px', background: 'var(--bg-sunken)', borderRadius: 8 }}>
          {c.shiftDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <IconCalendar />
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.shiftDate}</span>
              {c.timeStart && <span style={{ color: 'var(--ink-3)' }}>{c.timeStart}{c.timeEnd ? ` – ${c.timeEnd}` : ''}</span>}
            </div>
          )}
          {(c.metro || c.address) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>
              <IconPin />
              <span>{[c.metro, c.address].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 1, background: 'var(--line)', marginBottom: 10 }} />

      {/* clicks row */}
      <button
        onClick={() => hasApps && setOpen(o => !o)}
        style={{ all: 'unset', display: 'flex', alignItems: 'center', gap: 8, width: '100%', cursor: hasApps ? 'pointer' : 'default' }}
      >
        <IconPeople color={hasApps ? PALETTE.orange : '#C8C5BF'} />
        <span style={{ fontSize: 18, fontWeight: 700, color: hasApps ? 'var(--ink)' : 'var(--ink-4)', lineHeight: 1 }}>
          {c.apps.total}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 1 }}>
          {c.apps.total === 1 ? 'лайк' : c.apps.total >= 2 && c.apps.total <= 4 ? 'лайка' : 'лайков'}
        </span>
        {hasApps && (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <Pill color={PALETTE.green}  label="совп." value={c.apps.matched} />
              <Pill color={PALETTE.amber}  label="ожид." value={c.apps.pending} />
              <Pill color={PALETTE.red}    label="откл." value={c.apps.rejected} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
          </>
        )}
      </button>

      {hasApps && (
        <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: '#F0EEE9', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: PALETTE.green, width: `${matchedPct}%` }} />
        </div>
      )}

      {open && hasApps && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matched.length  > 0 && <ApplicantGroup title="Совпадение" color={PALETTE.green}  people={matched} />}
          {pending.length  > 0 && <ApplicantGroup title="Ожидают"    color={PALETTE.amber}  people={pending} />}
          {rejected.length > 0 && <ApplicantGroup title="Отказали"   color={PALETTE.red}    people={rejected} />}
        </div>
      )}
    </div>
  )
}

// ─── Постоянные вакансии ───────────────────────────────────────────────────

type PermCard = {
  id: string
  title: string
  company: string
  metro: string | null
  address: string | null
  salary: string | null
  salaryRaw: number | null
  status: string
  schedule: string | null
  createdAt: string | null
  apps: { total: number; pending: number; approved: number; rejected: number }
  applicants: AppInfo[]
}

function makeVacancyPost(c: PermCard): string {
  const lines: string[] = []
  lines.push(`👷 ${c.title}`)
  if (c.company && c.company !== '—') lines.push(`🏢 ${c.company}`)
  if (c.address) lines.push(`📍 ${c.address}`)
  if (c.metro) lines.push(`🚇 м. ${c.metro}`)
  if (c.salary) lines.push(`💰 ${c.salary}/мес`)
  if (c.schedule) lines.push(`🗓 ${c.schedule}`)
  return lines.join('\n')
}

function PermVacancyCards({ cards, onExport, onRefresh }: { cards: PermCard[]; onExport: () => void; onRefresh: () => void }) {
  if (!cards || cards.length === 0) return null
  const [allPostCopied, setAllPostCopied] = useState(false)
  const [showAllPost, setShowAllPost] = useState(false)

  const openCards = cards.filter(c => c.status === 'open')

  function copyAllPosts() {
    const text = openCards.map(makeVacancyPost).join('\n\n—————\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setAllPostCopied(true)
      setTimeout(() => setAllPostCopied(false), 2000)
    })
  }

  const allPostText = openCards.map(makeVacancyPost).join('\n\n—————\n\n')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          Постоянные вакансии
          <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 400, color: 'var(--ink-3)' }}>
            {cards.length} всего · сортировка по откликам
          </span>
        </div>
        <button
          onClick={() => setShowAllPost(v => !v)}
          style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--line)', background: showAllPost ? PALETTE.orange : 'var(--bg-elev)', color: showAllPost ? '#fff' : 'var(--ink-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8h12M8 3l5 5-5 5"/></svg>
          Посты для группы ({openCards.length})
        </button>
        <button onClick={onExport} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 13h10"/></svg>
          CSV
        </button>
      </div>

      {showAllPost && openCards.length > 0 && (
        <div style={{ marginBottom: 16, background: 'var(--bg-sunken)', borderRadius: 10, padding: 14, border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
              Готовые посты · {openCards.length} открытых вакансий
            </span>
            <button
              onClick={copyAllPosts}
              style={{ height: 28, padding: '0 12px', borderRadius: 6, border: 'none', background: allPostCopied ? PALETTE.green : PALETTE.orange, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {allPostCopied ? '✓ Скопировано' : 'Скопировать всё'}
            </button>
          </div>
          <pre style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink)', fontFamily: 'inherit', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' }}>
            {allPostText}
          </pre>
        </div>
      )}

      <div className="perm-vac-grid">
        {cards.map(c => <PermCard key={c.id} c={c} onRefresh={onRefresh} />)}
      </div>
    </div>
  )
}

function PermCard({ c, onRefresh }: { c: PermCard; onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editFields, setEditFields] = useState({
    status: c.status as 'open' | 'closed',
    title: c.title,
    salary: c.salary ? c.salary.replace(/[^\d]/g, '') : '',
    metro_station: c.metro ?? '',
    schedule: c.schedule ?? '',
  })

  async function handleSave() {
    setSaving(true)
    try {
      await updatePermVacancy(c.id, {
        status: editFields.status,
        title: editFields.title || undefined,
        salary: editFields.salary ? Number(editFields.salary) : null,
        metro_station: editFields.metro_station || undefined,
        schedule: editFields.schedule || undefined,
      })
      setEditing(false)
      onRefresh()
    } catch { } finally { setSaving(false) }
  }

  const isOpen = editing ? editFields.status === 'open' : c.status === 'open'
  const hasApps = c.apps.total > 0
  const approvedPct = hasApps ? Math.round(c.apps.approved / c.apps.total * 100) : 0

  const pending = c.applicants.filter(a => a.status === 'pending')
  const approved = c.applicants.filter(a => a.status === 'approved')
  const rejected = c.applicants.filter(a => a.status === 'rejected')

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
            {editing ? editFields.title : c.title}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{c.company}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={() => setEditing(e => !e)} style={{
            fontSize: 10.5, padding: '2px 7px', borderRadius: 5, border: '1px solid var(--line)', cursor: 'pointer',
            background: editing ? 'var(--ink)' : 'var(--bg-sunken)', color: editing ? '#fff' : 'var(--ink-3)',
          }}>✏️</button>
          <span style={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: isOpen ? '#EBF5F0' : '#F2F1EE',
            color: isOpen ? PALETTE.green : '#9A9690',
            letterSpacing: '0.04em',
          }}>
            {isOpen ? 'ОТКРЫТА' : 'ЗАКРЫТА'}
          </span>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div style={{ marginBottom: 12, padding: '12px', background: 'var(--bg-sunken)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <span style={{ color: 'var(--ink-3)', minWidth: 60 }}>Статус:</span>
            <select value={editFields.status} onChange={e => setEditFields(f => ({ ...f, status: e.target.value as any }))}
              style={{ height: 28, padding: '0 6px', border: '1px solid var(--line)', borderRadius: 5, background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}>
              <option value="open">Открыта</option>
              <option value="closed">Закрыта</option>
            </select>
          </label>
          {[
            ['Название', 'title'],
            ['Зарплата', 'salary'],
            ['Метро', 'metro_station'],
            ['График', 'schedule'],
          ].map(([label, key]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--ink-3)', minWidth: 60 }}>{label}</span>
              <input
                value={(editFields as any)[key]}
                onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
                style={{ flex: 1, height: 28, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 5, background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, outline: 'none' }}
              />
            </label>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ height: 30, padding: '0 14px', borderRadius: 6, border: 'none', background: 'var(--positive)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
              {saving ? '…' : '✓ Сохранить'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ height: 30, padding: '0 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', fontSize: 12.5, cursor: 'pointer' }}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 10 }}>
        {c.salary && <span style={{ fontSize: 12, fontWeight: 600, color: PALETTE.blue }}>{c.salary}</span>}
        {c.metro && (
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <IconMetro /> {c.metro}
          </span>
        )}
        {c.schedule && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{c.schedule}</span>}
        {c.createdAt && <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>{c.createdAt}</span>}
      </div>

      {/* divider */}
      <div style={{ height: 1, background: 'var(--line)', marginBottom: 10 }} />

      {/* applications row — кликабельная */}
      <button
        onClick={() => hasApps && setOpen(o => !o)}
        style={{
          all: 'unset', display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          cursor: hasApps ? 'pointer' : 'default',
        }}
      >
        <IconPeople color={hasApps ? PALETTE.blue : '#C8C5BF'} />
        <span style={{ fontSize: 18, fontWeight: 700, color: hasApps ? 'var(--ink)' : 'var(--ink-4)', lineHeight: 1 }}>
          {c.apps.total}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 1 }}>
          {c.apps.total === 1 ? 'отклик' : c.apps.total >= 2 && c.apps.total <= 4 ? 'отклика' : 'откликов'}
        </span>
        {hasApps && (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <Pill color={PALETTE.amber} label="ожид." value={c.apps.pending} />
              <Pill color={PALETTE.green} label="одобр." value={c.apps.approved} />
              <Pill color={PALETTE.red} label="откл." value={c.apps.rejected} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
          </>
        )}
      </button>

      {/* progress bar */}
      {hasApps && (
        <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: '#F0EEE9', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: PALETTE.green, width: `${approvedPct}%` }} />
        </div>
      )}

      {/* раскрывающийся список заявителей */}
      {open && hasApps && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approved.length > 0 && (
            <ApplicantGroup title="Принято" color={PALETTE.green} people={approved} />
          )}
          {pending.length > 0 && (
            <ApplicantGroup title="Ожидают" color={PALETTE.amber} people={pending} />
          )}
          {rejected.length > 0 && (
            <ApplicantGroup title="Отклонено" color={PALETTE.red} people={rejected} />
          )}
        </div>
      )}
    </div>
  )
}

function ApplicantGroup({ title, color, people }: { title: string; color: string; people: AppInfo[] }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {title} · {people.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {people.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 10px', borderRadius: 8,
            background: color + '0D',
            border: '1px solid ' + color + '22',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: color + '22',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color,
            }}>
              {p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'Geist Mono, monospace' }}>{p.phone}</div>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-4)', flexShrink: 0 }}>{p.date}</div>
          </div>
        ))}
      </div>
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

function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B6760" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B6760" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
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
