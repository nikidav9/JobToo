'use client'
import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/PageHeader'
import { supabaseAdmin } from '@/lib/supabase'
import { broadcastInApp, sendInAppToUser } from '@/lib/admin-actions'
import { logActivity } from '@/lib/activity-log'

type Role = 'all' | 'workers' | 'employers'
type St = 'idle' | 'loading' | 'ok' | 'err'

interface UserRow {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string
  role: string
  metro_station: string | null
  created_at: string
  push_token: string | null
}

interface NotifRow {
  id: string
  user_id: string
  title: string
  body: string
  is_read: boolean
  created_at: string
  jm_users?: { first_name: string | null; last_name: string | null; phone: string }
}

const TARGETS: { value: Role; label: string; desc: string }[] = [
  { value: 'all',       label: '👥 Все без push',        desc: 'Работники + работодатели без Expo-токена' },
  { value: 'workers',   label: '👷 Работники без push',   desc: 'Только работники без токена' },
  { value: 'employers', label: '🏢 Работодатели без push', desc: 'Только работодатели без токена' },
]

export default function NotificationsPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [notifs, setNotifs] = useState<NotifRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'send' | 'history' | 'users'>('send')

  // send form
  const [target, setTarget] = useState<Role>('all')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [st, setSt] = useState<St>('idle')
  const [result, setResult] = useState('')

  // user send
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [userTitle, setUserTitle] = useState('')
  const [userBody, setUserBody] = useState('')
  const [userSt, setUserSt] = useState<St>('idle')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: u }, { data: n }] = await Promise.all([
      supabaseAdmin.from('jm_users')
        .select('id, first_name, last_name, phone, role, metro_station, created_at, push_token')
        .is('push_token', null)
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('jm_notifications')
        .select('id, user_id, title, body, is_read, created_at, jm_users(first_name, last_name, phone)')
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    setUsers(u ?? [])
    setNotifs((n ?? []) as any)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleBroadcast() {
    if (!title.trim() || !body.trim()) return
    setSt('loading'); setResult('')
    try {
      const count = await broadcastInApp(target, title, body)
      setSt('ok'); setResult(`✓ Отправлено ${count} пользователям`)
      load()
    } catch (e: any) {
      setSt('err'); setResult('✗ ' + e.message)
    }
    setTimeout(() => setSt('idle'), 4000)
  }

  async function handleSendToUser() {
    if (!selectedUser || !userTitle.trim() || !userBody.trim()) return
    setUserSt('loading')
    try {
      await sendInAppToUser(selectedUser.id, userTitle, userBody)
      setUserSt('ok')
      setUserTitle(''); setUserBody(''); setSelectedUser(null)
      load()
    } catch (e: any) {
      setUserSt('err')
    }
    setTimeout(() => setUserSt('idle'), 3000)
  }

  const workers = users.filter(u => u.role === 'worker').length
  const employers = users.filter(u => u.role === 'employer').length
  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (u.first_name + ' ' + u.last_name + ' ' + u.phone).toLowerCase().includes(q)
  })

  const inp = (label: string, value: string, onChange: (v: string) => void, placeholder?: string, area?: boolean) => (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>{label}</label>
      {area
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', height: 36, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      }
    </div>
  )

  return (
    <div>
      <PageHeader title="Уведомления (без push)" />
      <div className="page-content">

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Без push-токена', value: users.length, color: 'var(--ink)' },
            { label: 'Работников', value: workers, color: 'var(--info)' },
            { label: 'Работодателей', value: employers, color: 'var(--violet)' },
            { label: 'Отправлено уведомлений', value: notifs.length, color: 'var(--positive)' },
          ].map(k => (
            <div key={k.label} style={{ flex: '1 1 140px', background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.color, letterSpacing: '-0.03em' }}>{loading ? '…' : k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', paddingBottom: 0 }}>
          {([['send', '✉️ Отправить'], ['history', '📋 История'], ['users', '👥 Пользователи']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--ink)' : 'var(--ink-3)',
              borderBottom: tab === t ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {/* ── Send tab ── */}
        {tab === 'send' && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* Broadcast */}
            <div style={{ flex: '1 1 300px', background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 14 }}>
                📣 Массовая рассылка
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 14, lineHeight: 1.5 }}>
                Уведомление сохранится в базе — пользователи увидят его в приложении в разделе уведомлений.
              </div>

              {/* Target */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {TARGETS.map(t => (
                  <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: target === t.value ? 'var(--accent-soft)' : 'var(--bg-sunken)', border: `1px solid ${target === t.value ? 'var(--accent-line)' : 'transparent'}` }}>
                    <input type="radio" name="notif-target" value={t.value} checked={target === t.value} onChange={() => setTarget(t.value)} style={{ accentColor: 'var(--accent)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{t.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {inp('Заголовок', title, setTitle, 'Напр.: 📢 Новые вакансии рядом!')}
                {inp('Текст', body, setBody, 'Напр.: Посмотрите свежие предложения в вашем районе', true)}

                {(title || body) && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-sunken)', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 5 }}>Предпросмотр</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{title || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{body || '—'}</div>
                  </div>
                )}

                <button onClick={handleBroadcast} disabled={!title.trim() || !body.trim() || st === 'loading'}
                  style={{ height: 40, borderRadius: 8, border: 'none', cursor: 'pointer', background: st === 'ok' ? 'var(--positive)' : st === 'err' ? 'var(--negative)' : 'var(--ink)', color: '#fff', fontSize: 13.5, fontWeight: 500, opacity: !title.trim() || !body.trim() ? 0.45 : 1 }}>
                  {st === 'loading' ? 'Отправка…' : st === 'ok' ? '✓ Отправлено' : '📨 Отправить уведомление'}
                </button>

                {result && (
                  <div style={{ padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: result.startsWith('✓') ? 'rgba(46,125,84,.08)' : 'rgba(179,60,42,.08)', color: result.startsWith('✓') ? 'var(--positive)' : 'var(--negative)', border: `1px solid ${result.startsWith('✓') ? 'rgba(46,125,84,.2)' : 'rgba(179,60,42,.2)'}` }}>
                    {result}
                  </div>
                )}
              </div>
            </div>

            {/* Send to user */}
            <div style={{ flex: '1 1 300px', background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 14 }}>
                👤 Конкретному пользователю
              </div>

              <div style={{ marginBottom: 12 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени или телефону…"
                  style={{ width: '100%', height: 36, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {selectedUser ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {selectedUser.first_name} {selectedUser.last_name}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{selectedUser.phone} · {selectedUser.role === 'worker' ? 'Работник' : 'Работодатель'}</div>
                    </div>
                    <button onClick={() => setSelectedUser(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {inp('Заголовок', userTitle, setUserTitle, 'Заголовок уведомления')}
                    {inp('Текст', userBody, setUserBody, 'Текст уведомления', true)}
                    <button onClick={handleSendToUser} disabled={!userTitle.trim() || !userBody.trim() || userSt === 'loading'}
                      style={{ height: 38, borderRadius: 8, border: 'none', cursor: 'pointer', background: userSt === 'ok' ? 'var(--positive)' : userSt === 'err' ? 'var(--negative)' : 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 500, opacity: !userTitle.trim() || !userBody.trim() ? 0.45 : 1 }}>
                      {userSt === 'loading' ? '…' : userSt === 'ok' ? '✓' : '📨 Отправить'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filtered.slice(0, 40).map(u => (
                    <button key={u.id} onClick={() => setSelectedUser(u)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--bg-sunken)', border: '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--line)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: u.role === 'worker' ? 'var(--info)' : 'var(--violet)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                        {(u.first_name?.[0] ?? u.phone[0]).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.first_name || u.last_name ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : '—'}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
                          {u.phone} · {u.role === 'worker' ? '👷' : '🏢'} {u.metro_station ?? ''}
                        </div>
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-4)', padding: 12 }}>Ничего не найдено</div>}
                  {filtered.length > 40 && <div style={{ fontSize: 12, color: 'var(--ink-4)', padding: '8px 12px' }}>Показано 40 из {filtered.length} — уточните поиск</div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── History tab ── */}
        {tab === 'history' && (
          <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 14 }}>
              Последние 100 уведомлений
            </div>
            {loading ? <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>Загрузка…</div> : notifs.length === 0
              ? <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>Уведомления ещё не отправлялись</div>
              : (
                <div className="table-scroll">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        {['Получатель', 'Заголовок', 'Текст', 'Прочитано', 'Время'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {notifs.map(n => (
                        <tr key={n.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--ink-2)' }}>
                            {(n as any).jm_users?.first_name ?? ''} {(n as any).jm_users?.last_name ?? ''}<br />
                            <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{(n as any).jm_users?.phone ?? n.user_id}</span>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--ink)' }}>{n.title}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--ink-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: n.is_read ? 'rgba(46,125,84,.1)' : 'rgba(59,91,181,.08)', color: n.is_read ? 'var(--positive)' : 'var(--info)' }}>
                              {n.is_read ? '✓ Прочитано' : 'Не прочитано'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--ink-4)', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                            {new Date(n.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)' }}>
                Пользователи без push-токена ({users.length})
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
                Как только появится токен — они уйдут в раздел Рассылка
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по имени или телефону…"
                style={{ width: '100%', maxWidth: 320, height: 34, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Пользователь', 'Телефон', 'Роль', 'Метро', 'Регистрация', ''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--ink)' }}>
                          {u.first_name || u.last_name ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink-2)' }}>{u.phone}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: u.role === 'worker' ? 'rgba(59,91,181,.08)' : 'rgba(95,75,182,.08)', color: u.role === 'worker' ? 'var(--info)' : 'var(--violet)' }}>
                          {u.role === 'worker' ? '👷 Работник' : '🏢 Работодатель'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink-3)', fontSize: 12 }}>{u.metro_station ?? '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--ink-4)', fontSize: 12 }}>
                        {new Date(u.created_at).toLocaleDateString('ru')}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <button onClick={() => { setSelectedUser(u); setTab('send') }}
                          style={{ height: 26, padding: '0 10px', borderRadius: 5, border: '1px solid var(--line)', background: 'var(--bg-elev)', color: 'var(--ink-2)', fontSize: 11.5, cursor: 'pointer' }}>
                          📨 Написать
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
