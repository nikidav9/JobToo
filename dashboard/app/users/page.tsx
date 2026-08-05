'use client'
import { useCallback, useState, useEffect } from 'react'
import { fetchUsers, fetchUserProfile, PALETTE } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import PageHeader from '@/components/PageHeader'
import { blockUser, resetPassword, sendBothToUser, deleteUser, changeRole } from '@/lib/admin-actions'
import { downloadCSV } from '@/lib/csv-export'
import { getVerifiedUsers, setUserVerified } from '@/lib/verification'
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const TT = { borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink)', fontSize: 12, boxShadow: 'var(--shadow-md)' }
const AXIS = { fontSize: 10, fill: '#9A9690', fontFamily: 'Geist Mono, monospace' }

function initials(name: string, phone: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return phone.slice(-2)
}

type ActionState = 'idle' | 'loading' | 'ok' | 'err'

function ProfileDrawer({ userId, onClose, verifiedSet, onVerifyToggle }: {
  userId: string
  onClose: () => void
  verifiedSet: Set<string>
  onVerifyToggle: (id: string) => void
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'likes' | 'reviews' | 'vacancies' | 'chats'>('overview')

  useEffect(() => {
    fetchUserProfile(userId).then(d => { setData(d); setLoading(false) })
  }, [userId])

  const isVerified = verifiedSet.has(userId)

  if (loading || !data) return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>Загрузка…</div>
    </div>
  )

  const { user, chats, ratingsReceived, likes, vacancies, permVacancies, permApps, avgRating, totalLikes, totalMatches } = data
  if (!user) return null

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.phone || '—'
  const isWorker = user.role === 'worker'
  const ini = initials(name, user.phone ?? '')

  const tabs = [
    { id: 'overview', label: 'Обзор' },
    { id: 'likes', label: `Лайки (${totalLikes})` },
    { id: 'reviews', label: `Отзывы (${ratingsReceived.length})` },
    { id: 'vacancies', label: `Вакансии (${vacancies.length + permVacancies.length})` },
    { id: 'chats', label: `Чаты (${chats.length})` },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: isWorker ? 'linear-gradient(135deg,#C8501E,#7D2D0E)' : 'linear-gradient(135deg,#3B5BB5,#1F3A8A)',
            display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 16,
          }}>{ini}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{name}</span>
              {isVerified && (
                <span style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 4, background: 'rgba(46,125,84,.1)', color: 'var(--positive)', border: '1px solid rgba(46,125,84,.25)', fontWeight: 500 }}>✓ Верифицирован</span>
              )}
              {user.is_blocked && (
                <span style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 4, background: 'rgba(179,60,42,.1)', color: 'var(--negative)', border: '1px solid rgba(179,60,42,.25)', fontWeight: 500 }}>🚫 Заблокирован</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Geist Mono, monospace' }}>{user.phone || '—'}</span>
              {user.metro_station && <span>😇 {user.metro_station}</span>}
              {user.company && <span>🏢 {user.company}</span>}
              <span style={{ color: 'var(--ink-4)' }}>с {user.created_at?.slice(0, 10)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)', padding: 4, fontSize: 18 }}
          >✕</button>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setUserVerified(userId, !isVerified); onVerifyToggle(userId) }}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 500,
              background: isVerified ? 'rgba(46,125,84,.1)' : 'var(--bg-sunken)',
              border: `1px solid ${isVerified ? 'rgba(46,125,84,.3)' : 'var(--line)'}`,
              color: isVerified ? 'var(--positive)' : 'var(--ink-2)',
            }}
          >
            {isVerified ? '✓ Верифицирован' : '☑ Верифицировать'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', background: 'var(--bg-elev)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            height: 38, padding: '0 14px', border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap',
            background: 'transparent',
            color: tab === t.id ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="g-3">
              <StatBox label="Лайков" value={totalLikes} />
              <StatBox label="Совпадений" value={totalMatches} />
              <StatBox label="Чатов" value={chats.length} />
              {avgRating && <StatBox label="Средний рейтинг" value={avgRating + ' ★'} />}
              <StatBox label="Отзывов о нём" value={ratingsReceived.length} />
            </div>
            <div style={{ background: 'var(--bg-sunken)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 8 }}>Информация об аккаунте</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
                {[
                  ['ID', user.id],
                  ['Роль', isWorker ? 'Работник' : 'Работодатель'],
                  ['Телефон', user.phone || '—'],
                  ['Метро', user.metro_station || '—'],
                  ['Компания', user.company || '—'],
                  ['Регистрация', user.created_at?.slice(0, 10) || '—'],
                  ['Push-токен', user.push_token ? '✓ Expo (Android/APK)' : '✗ Нет'],
                  ['iPhone Web Push', data.hasWebPush ? `✓ Подключён · ${data.webPushDate}` : '✗ Нет'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--ink-3)', minWidth: 100 }}>{k}</span>
                    <span style={{ color: 'var(--ink)', fontFamily: (k === 'ID' || k === 'Телефон') ? 'Geist Mono, monospace' : 'inherit', fontSize: k === 'ID' ? 10.5 : 12.5, wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'likes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {likes.length === 0 && <Empty text="Нет лайков" />}
            {likes.map((l: any) => (
              <div key={l.id} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13 }}>{l.is_match ? '💚' : l.worker_liked ? '🟡' : '⚪'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 500 }}>
                    {l.is_match ? 'Совпадение' : l.worker_liked ? 'Лайк' : 'Просмотр'}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace' }}>{l.created_at?.slice(0, 10)}</div>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.vacancy_id?.slice(0, 8)}…
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'reviews' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ratingsReceived.length === 0 && <Empty text="Нет отзывов" />}
            {ratingsReceived.map((r: any) => (
              <div key={r.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, letterSpacing: 1 }}>{'★'.repeat(Number(r.rating))}{'☆'.repeat(5 - Number(r.rating))}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace' }}>{r.created_at?.slice(0, 10)}</span>
                </div>
                {r.review_text && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.review_text}</div>}
              </div>
            ))}
          </div>
        )}
        {tab === 'vacancies' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {vacancies.length === 0 && permVacancies.length === 0 && <Empty text="Нет вакансий" />}
            {vacancies.map((v: any) => (
              <div key={v.id} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>⚡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{v.work_type_label || v.work_type || 'Вакансия'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{v.address || '—'} · {v.created_at?.slice(0, 10)}</div>
                </div>
                <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, background: v.status === 'open' ? 'rgba(46,125,84,.1)' : 'var(--bg-sunken)', color: v.status === 'open' ? 'var(--positive)' : 'var(--ink-4)' }}>
                  {v.status === 'open' ? 'Открыта' : 'Закрыта'}
                </span>
              </div>
            ))}
            {permVacancies.map((v: any) => (
              <div key={v.id} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>💼</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{v.title || 'Вакансия'}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{v.address || '—'} · {v.created_at?.slice(0, 10)}</div>
                </div>
                <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 4, background: v.status === 'open' ? 'rgba(46,125,84,.1)' : 'var(--bg-sunken)', color: v.status === 'open' ? 'var(--positive)' : 'var(--ink-4)' }}>
                  {v.status === 'open' ? 'Открыта' : 'Закрыта'}
                </span>
              </div>
            ))}
          </div>
        )}
        {tab === 'chats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chats.length === 0 && <Empty text="Нет чатов" />}
            {chats.map((c: any) => (
              <div key={c.id} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elev)' }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{c.vac_title || 'Чат'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                  {c.company_name && `${c.company_name} · `}{c.created_at?.slice(0, 10)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>{text}</div>
}

export default function UsersPage() {
  const fetcher = useCallback(() => fetchUsers(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_users'], intervalSec: 30,
  })

  const [phoneSearch, setPhoneSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<string, { s: ActionState; msg?: string }>>({})
  const [pushText, setPushText] = useState<Record<string, string>>({})
  const [verifiedSet, setVerifiedSet] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<Record<string, boolean>>({})
  const [confirmRole, setConfirmRole] = useState<Record<string, boolean>>({})

  useEffect(() => { setVerifiedSet(getVerifiedUsers()) }, [])

  if (loading || !d) return <Loader />

  const workerPct = Math.round(d.kpi.workers / Math.max(d.kpi.total, 1) * 100)
  const filteredUsers = phoneSearch.trim()
    ? d.recent.filter((u: any) => (u.phone ?? '').includes(phoneSearch.trim()))
    : d.recent

  function setA(id: string, s: ActionState, msg?: string) {
    setActions(prev => ({ ...prev, [id]: { s, msg } }))
  }

  async function handleBlock(u: any) {
    setA(u.id, 'loading')
    try {
      await blockUser(u.id, !u.blocked, u.name)
      setA(u.id, 'ok', u.blocked ? 'Разблокирован' : 'Заблокирован')
      setTimeout(refresh, 800)
    } catch (e: any) { setA(u.id, 'err', e.message) }
  }

  async function handleResetPwd(u: any) {
    setA(u.id + '_pwd', 'loading')
    try {
      const pwd = await resetPassword(u.id)
      setA(u.id + '_pwd', 'ok', `Новый пароль: ${pwd}`)
    } catch (e: any) { setA(u.id + '_pwd', 'err', e.message) }
  }

  async function handlePush(u: any) {
    const text = pushText[u.id]?.trim()
    if (!text) return
    setA(u.id + '_push', 'loading')
    try {
      await sendBothToUser(u.id, '📢 Сообщение от администратора', text)
      setA(u.id + '_push', 'ok', 'Отправлено')
      setPushText(prev => ({ ...prev, [u.id]: '' }))
    } catch (e: any) { setA(u.id + '_push', 'err', e.message) }
  }

  // Смена роли с подтверждением: у бывшего работодателя закроются вакансии,
  // и вернуть их обратно одним нажатием уже не выйдет.
  async function handleRole(u: any) {
    const target = u.role === 'worker' ? 'employer' : 'worker'
    if (!confirmRole[u.id]) {
      setConfirmRole(prev => ({ ...prev, [u.id]: true }))
      setTimeout(() => setConfirmRole(prev => ({ ...prev, [u.id]: false })), 4000)
      return
    }
    setConfirmRole(prev => ({ ...prev, [u.id]: false }))
    setA(u.id + '_role', 'loading')
    try {
      const { closedVacancies } = await changeRole(u.id, target, u.name)
      setA(u.id + '_role', 'ok',
        target === 'worker'
          ? `Теперь работник${closedVacancies ? `, закрыто вакансий: ${closedVacancies}` : ''}`
          : 'Теперь работодатель')
      setTimeout(refresh, 800)
    } catch (e: any) { setA(u.id + '_role', 'err', e.message) }
  }

  async function handleDelete(u: any) {
    if (!confirmDelete[u.id]) {
      setConfirmDelete(prev => ({ ...prev, [u.id]: true }))
      setTimeout(() => setConfirmDelete(prev => ({ ...prev, [u.id]: false })), 4000)
      return
    }
    setConfirmDelete(prev => ({ ...prev, [u.id]: false }))
    setA(u.id + '_del', 'loading')
    try {
      await deleteUser(u.id, u.role, u.name)
      setA(u.id + '_del', 'ok', 'Удалён')
      setTimeout(refresh, 800)
    } catch (e: any) { setA(u.id + '_del', 'err', e.message) }
  }

  function handleExportCSV() {
    const rows = filteredUsers.map((u: any) => ({
      'Имя': u.name || '',
      'Телефон': u.phone || '',
      'Роль': u.role === 'worker' ? 'Работник' : 'Работодатель',
      'Метро': u.metro || '',
      'Компания': u.company || '',
      'Статус': u.blocked ? 'Заблокирован' : 'Активен',
      'Expo Push': u.hasPushToken ? 'Есть' : 'Нет',
      'iPhone Web Push': u.hasWebPush ? `Есть (${u.webPushDate})` : 'Нет',
      'Верифицирован': verifiedSet.has(u.id) ? 'Да' : 'Нет',
      'Дата': u.date || '',
    }))
    downloadCSV(rows, `users_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div style={{ position: 'relative' }}>
      <PageHeader title="Пользователи" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
      <div className="page-content">
        <div className="g-6">
          <KpiCard label="Всего" value={d.kpi.total} />
          <KpiCard label="Работники" value={d.kpi.workers} sub={`${workerPct}% базы`} sparkColor={PALETTE.orange} />
          <KpiCard label="Работодатели" value={d.kpi.employers} sub={`${100 - workerPct}% базы`} sparkColor={PALETTE.blue} />
          <KpiCard label="Заблокировано" value={d.kpi.blocked} sparkColor={PALETTE.red} />
          <KpiCard label="Новых · 7 дней" value={d.kpi.newWeek} deltaTone="pos" delta={`+${d.kpi.newWeek}`} />
          <KpiCard label="Новых · 30 дней" value={d.kpi.newMonth} deltaTone="pos" delta={`+${d.kpi.newMonth}`} />
          <KpiCard label="С пуш-токеном" value={d.kpi.withPushToken} sub={`${d.kpi.total ? Math.round(d.kpi.withPushToken / d.kpi.total * 100) : 0}% базы`} sparkColor={PALETTE.green} />
          <KpiCard label="Без пуш-токена" value={d.kpi.withoutPushToken} sub="не получат пуши" sparkColor={PALETTE.red} />
          <KpiCard label="📱 iPhone Web Push" value={d.kpi.withWebPush} sub={`+${d.kpi.webPushNewWeek} за 7 дн`} sparkColor="#A855F7" />
        </div>
        <div className="g-14">
          <ChartCard title="Новые регистрации" sub="Работники vs работодатели · 90 дней">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.growth90} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gW2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.2}/><stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0}/></linearGradient>
                  <linearGradient id="gE2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={PALETTE.blue} stopOpacity={0.2}/><stop offset="95%" stopColor={PALETTE.blue} stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
                <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} interval={8} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
                <Area type="monotone" dataKey="workers" name="Работники" stroke={PALETTE.orange} fill="url(#gW2)" strokeWidth={1.7} dot={false} />
                <Area type="monotone" dataKey="employers" name="Работодатели" stroke={PALETTE.blue} fill="url(#gE2)" strokeWidth={1.7} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Соотношение ролей" sub={`${d.kpi.total} пользователей`}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={[{ name: 'Работники', value: d.kpi.workers }, { name: 'Работодатели', value: d.kpi.employers }]} cx="50%" cy="50%" innerRadius={42} outerRadius={60} dataKey="value" paddingAngle={3}>
                  <Cell fill={PALETTE.orange} /><Cell fill={PALETTE.blue} />
                </Pie>
                <Tooltip contentStyle={TT} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        <ChartCard title="Топ станций метро" sub="Работники и работодатели">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.metroTop.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
              <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="station" tick={{ ...AXIS, fill: '#3D3A33' }} tickLine={false} axisLine={false} width={120} />
              <Tooltip contentStyle={TT} />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#6B6760' }} />
              <Bar dataKey="workers" name="Работники" fill={PALETTE.orange} stackId="a" />
              <Bar dataKey="employers" name="Работодатели" fill={PALETTE.blue} stackId="a" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {d.recent.length > 0 && (
          <ChartCard
            title="Все пользователи"
            sub={phoneSearch.trim() ? `Найдено ${filteredUsers.length} из ${d.recent.length}` : `${d.recent.length} пользователей · CRM`}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Поиск по номеру телефона..."
                value={phoneSearch}
                onChange={e => setPhoneSearch(e.target.value)}
                style={{
                  width: '100%', maxWidth: 300, padding: '7px 12px',
                  border: '1px solid var(--line)', borderRadius: 8,
                  background: 'var(--bg-sunken)', color: 'var(--ink)',
                  fontSize: 13, outline: 'none', fontFamily: 'Geist Mono, monospace',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--line)')}
              />
              <button
                onClick={handleExportCSV}
                style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-sunken)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8M5 7l3 3 3-3M3 13h10"/>
                </svg>
                Экспорт CSV
              </button>
            </div>
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Пользователь', 'Роль', 'Метро', 'Компания', 'Статус', 'Пуш', 'Верификация', 'Дата', 'Действия'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500, padding: '8px 12px 10px', background: 'var(--bg)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0
                    ? <tr><td colSpan={9} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Не найдено</td></tr>
                    : filteredUsers.map((u: any) => {
                        const isWorker = u.role === 'worker'
                        const ini = initials(u.name || '', u.phone || '')
                        const expanded = expandedId === u.id
                        const aBlock = actions[u.id]
                        const aPwd = actions[u.id + '_pwd']
                        const aPush = actions[u.id + '_push']
                        const aDel = actions[u.id + '_del']
                        const isVerified = verifiedSet.has(u.id)
                        const isConfirmDel = confirmDelete[u.id]
                        return (
                          <>
                            <tr key={u.id}
                              style={{ borderBottom: expanded ? 'none' : '1px solid var(--line)', background: expanded ? 'var(--bg-sunken)' : undefined, cursor: 'pointer' }}
                              onClick={() => setExpandedId(expanded ? null : u.id)}
                              onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunken)' }}
                              onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '' }}
                            >
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: isWorker ? 'linear-gradient(135deg,#C8501E,#7D2D0E)' : 'linear-gradient(135deg,#3B5BB5,#1F3A8A)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 600, fontSize: 11 }}>{ini}</div>
                                  <div>
                                    <div style={{ fontWeight: 550, color: u.blocked ? 'var(--negative)' : 'var(--ink)', fontSize: 13, lineHeight: 1.2 }}>
                                      {u.name || <span style={{ color: 'var(--ink-3)' }}>Имя не указано</span>}
                                    </div>
                                    <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{u.phone || '—'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 500, color: isWorker ? 'var(--accent)' : 'var(--info)', background: isWorker ? 'var(--accent-soft)' : 'rgba(59,91,181,.08)', border: `1px solid ${isWorker ? 'var(--accent-line)' : 'rgba(59,91,181,.18)'}` }}>
                                  {isWorker ? 'Работник' : 'Работодатель'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', color: 'var(--ink-2)', fontSize: 12.5 }}>
                                {u.metro && u.metro !== '—' ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ink-3)', display: 'inline-block', marginRight: 5 }} />{u.metro}</> : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                              </td>
                              <td style={{ padding: '10px 12px', color: u.company && u.company !== '—' ? 'var(--ink-2)' : 'var(--ink-4)', maxWidth: 140 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.company || '—'}</span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {u.blocked
                                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, fontSize: 11.5, color: 'var(--negative)', background: 'rgba(179,60,42,.08)', border: '1px solid rgba(179,60,42,.18)' }}>🚫 Заблокирован</span>
                                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, fontSize: 11.5, color: 'var(--positive)', background: 'rgba(46,125,84,.08)', border: '1px solid rgba(46,125,84,.18)' }}>
                                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--positive)', display: 'inline-block' }} />Активен
                                    </span>}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {u.hasPushToken
                                    ? <span title="Expo push token (Android/iOS APK)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 500, color: 'var(--positive)', background: 'rgba(46,125,84,.08)', border: '1px solid rgba(46,125,84,.2)' }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--positive)', display: 'inline-block' }} />📲 Expo
                                      </span>
                                    : null}
                                  {u.hasWebPush
                                    ? <span title={`Web Push (iPhone Safari PWA) · подключён ${u.webPushDate}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 500, color: '#7C3AED', background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.25)' }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#A855F7', display: 'inline-block' }} />📱 iPhone
                                      </span>
                                    : null}
                                  {!u.hasPushToken && !u.hasWebPush
                                    ? <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>— нет</span>
                                    : null}
                                </div>
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                {isVerified
                                  ? <span style={{ fontSize: 11.5, color: 'var(--positive)', fontWeight: 500 }}>✓ Верифицирован</span>
                                  : <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>—</span>}
                              </td>
                              <td style={{ padding: '10px 12px', fontFamily: 'Geist Mono, monospace', fontSize: 11.5, color: 'var(--ink-3)' }}>{u.date || '—'}</td>
                              <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: 5 }}>
                                  <button onClick={() => setProfileId(u.id)}
                                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-sunken)', color: 'var(--ink-2)', fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    👤
                                  </button>
                                  {aBlock?.s === 'ok'
                                    ? <span style={{ fontSize: 11.5, color: 'var(--positive)', fontWeight: 500 }}>{aBlock.msg}</span>
                                    : <button onClick={() => handleBlock(u)} disabled={aBlock?.s === 'loading'}
                                        style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--line)', background: u.blocked ? 'rgba(46,125,84,.08)' : 'rgba(179,60,42,.08)', color: u.blocked ? 'var(--positive)' : 'var(--negative)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        {aBlock?.s === 'loading' ? '…' : u.blocked ? 'Разблок.' : 'Блок.'}
                                      </button>}
                                  <button onClick={() => setExpandedId(expanded ? null : u.id)}
                                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-sunken)', color: 'var(--ink-3)', fontSize: 11.5, cursor: 'pointer' }}>
                                    {expanded ? '▲' : '▼'}
                                  </button>
                                  {(() => {
                                    const aRole = actions[u.id + '_role']
                                    if (aRole?.s === 'ok') return <span style={{ fontSize: 11, color: 'var(--positive)', fontWeight: 500 }}>{aRole.msg}</span>
                                    if (aRole?.s === 'err') return <span style={{ fontSize: 11, color: 'var(--negative)' }} title={aRole.msg}>✗</span>
                                    const target = u.role === 'worker' ? 'работодателем' : 'работником'
                                    return (
                                      <button onClick={() => handleRole(u)} disabled={aRole?.s === 'loading'}
                                        title={`Сделать ${target}. Открытые вакансии при этом закроются.`}
                                        style={{
                                          padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                                          border: confirmRole[u.id] ? '1px solid rgba(179,60,42,.4)' : '1px solid var(--line)',
                                          background: confirmRole[u.id] ? 'rgba(179,60,42,.12)' : 'var(--bg-sunken)',
                                          color: confirmRole[u.id] ? 'var(--negative)' : 'var(--ink-4)',
                                          fontSize: 11.5, cursor: 'pointer',
                                        }}>
                                        {aRole?.s === 'loading' ? '…' : confirmRole[u.id] ? `Сделать ${target}?` : '⇄ роль'}
                                      </button>
                                    )
                                  })()}
                                  {aDel?.s === 'ok'
                                    ? <span style={{ fontSize: 11, color: 'var(--negative)', fontWeight: 500 }}>Удалён</span>
                                    : aDel?.s === 'err'
                                    ? <span style={{ fontSize: 11, color: 'var(--negative)' }}>✗</span>
                                    : isConfirmDel
                                    ? <button onClick={() => handleDelete(u)} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(179,60,42,.4)', background: 'rgba(179,60,42,.12)', color: 'var(--negative)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', animation: 'pulse 0.5s ease' }}>
                                        Удалить?
                                      </button>
                                    : <button onClick={() => handleDelete(u)} disabled={aDel?.s === 'loading'} title="Удалить пользователя и все его данные"
                                        style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-sunken)', color: 'var(--ink-4)', fontSize: 11.5, cursor: 'pointer' }}>
                                        {aDel?.s === 'loading' ? '…' : '🗑'}
                                      </button>}
                                </div>
                              </td>
                            </tr>
                            {expanded && (
                              <tr key={u.id + '_exp'} style={{ borderBottom: '1px solid var(--line)' }}>
                                <td colSpan={9} style={{ padding: '0 12px 14px 60px', background: 'var(--bg-sunken)' }}>
                                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 10 }}>
                                    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', minWidth: 200 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 8 }}>🔑 Сбросить пароль</div>
                                      {aPwd?.s === 'ok'
                                        ? <div style={{ fontSize: 13, color: 'var(--positive)' }}>
                                            <div style={{ fontWeight: 500, marginBottom: 2 }}>Новый пароль:</div>
                                            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 18, fontWeight: 700, letterSpacing: 2, color: 'var(--ink)', background: 'var(--bg-sunken)', padding: '4px 10px', borderRadius: 6 }}>
                                              {aPwd.msg?.replace('Новый пароль: ', '')}
                                            </div>
                                          </div>
                                        : aPwd?.s === 'err'
                                          ? <div style={{ fontSize: 12, color: 'var(--negative)' }}>{aPwd.msg}</div>
                                          : <button onClick={() => handleResetPwd(u)} disabled={aPwd?.s === 'loading'}
                                              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
                                              {aPwd?.s === 'loading' ? 'Генерация…' : 'Сгенерировать новый'}
                                            </button>}
                                    </div>
                                    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px', flex: 1, minWidth: 260 }}>
                                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 8 }}>📲 Отправить пуш</div>
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <input
                                          placeholder="Текст уведомления..."
                                          value={pushText[u.id] ?? ''}
                                          onChange={e => setPushText(prev => ({ ...prev, [u.id]: e.target.value }))}
                                          style={{ flex: 1, height: 32, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 12.5, outline: 'none' }}
                                        />
                                        <button onClick={() => handlePush(u)} disabled={!pushText[u.id]?.trim() || aPush?.s === 'loading'}
                                          style={{ padding: '0 12px', height: 32, borderRadius: 6, border: 'none', background: 'var(--ink)', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
                                          {aPush?.s === 'loading' ? '…' : 'Отправить'}
                                        </button>
                                      </div>
                                      {aPush?.s === 'ok' && <div style={{ fontSize: 11.5, color: 'var(--positive)', marginTop: 5 }}>✓ {aPush.msg}</div>}
                                      {aPush?.s === 'err' && <div style={{ fontSize: 11.5, color: 'var(--negative)', marginTop: 5 }}>✗ {aPush.msg}</div>}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </div>
      {profileId && (
        <>
          <div
            onClick={() => setProfileId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 40, backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw',
            background: 'var(--bg)', zIndex: 50, boxShadow: '-4px 0 32px rgba(0,0,0,.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <ProfileDrawer
              userId={profileId}
              onClose={() => setProfileId(null)}
              verifiedSet={verifiedSet}
              onVerifyToggle={id => setVerifiedSet(prev => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id); else next.add(id)
                return next
              })}
            />
          </div>
        </>
      )}
    </div>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 64 : 140, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
