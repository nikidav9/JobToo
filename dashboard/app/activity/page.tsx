'use client'
import { useEffect, useState } from 'react'
import { getActivityLog, clearActivityLog, ActivityEntry } from '@/lib/activity-log'
import PageHeader from '@/components/PageHeader'

const ACTION_COLORS: Record<string, string> = {
  'Заблокирован': '#B33C2A',
  'Разблокирован': '#2E7D54',
  'Сброшен пароль': '#A87020',
  'Пуш отправлен': '#3B5BB5',
  'Рассылка': '#5F4BB6',
  'Вакансия (врем.) обновлена': '#C8501E',
  'Вакансия (пост.) обновлена': '#0E7490',
  'Системное сообщение': '#9D2060',
  'Заметка к жалобе': '#6B6760',
  'Статус жалобы изменён': '#2E7D54',
}

function getColor(action: string) {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key) || key.includes(action)) return color
  }
  return '#6B6760'
}

const ICONS: Record<string, string> = {
  'Заблокирован': '🚫',
  'Разблокирован': '✅',
  'Сброшен пароль': '🔑',
  'Пуш отправлен': '📲',
  'Рассылка': '📢',
  'Вакансия': '📋',
  'Системное сообщение': '💬',
  'Жалоба': '⚠️',
}

function getIcon(action: string) {
  for (const [key, icon] of Object.entries(ICONS)) {
    if (action.includes(key)) return icon
  }
  return '⚙️'
}

export default function ActivityPage() {
  const [log, setLog] = useState<ActivityEntry[]>([])
  const [filter, setFilter] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    setLog(getActivityLog())
  }, [])

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return }
    clearActivityLog()
    setLog([])
    setConfirmClear(false)
  }

  function refresh() { setLog(getActivityLog()) }

  const filtered = filter.trim()
    ? log.filter(e => e.action.toLowerCase().includes(filter.toLowerCase()) || e.details.toLowerCase().includes(filter.toLowerCase()) || (e.userName ?? '').toLowerCase().includes(filter.toLowerCase()))
    : log

  function timeLabel(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div>
      <PageHeader title="Лог действий" onRefresh={refresh} />
      <div className="page-content">

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          {[
            { label: 'Всего записей', value: log.length },
            { label: 'Сегодня', value: log.filter(e => e.ts.slice(0, 10) === new Date().toISOString().slice(0, 10)).length },
            { label: 'Отфильтровано', value: filtered.length },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 16px', boxShadow: 'var(--shadow-sm)', minWidth: 120 }}>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Поиск по действию, деталям, имени..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ flex: 1, maxWidth: 360, height: 34, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none' }}
          />
          <button
            onClick={handleClear}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--line)', background: confirmClear ? 'var(--negative)' : 'var(--bg-sunken)', color: confirmClear ? '#fff' : 'var(--ink-2)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
          >
            {confirmClear ? 'Нажмите ещё раз для подтверждения' : '🗑 Очистить лог'}
          </button>
        </div>

        {/* Log table */}
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              {log.length === 0 ? 'Лог пуст — действия появятся здесь после блокировок, рассылок и т.д.' : 'Ничего не найдено'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-sunken)' }}>
                    {['Время', 'Действие', 'Детали', 'Пользователь'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', fontWeight: 500, padding: '8px 16px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => {
                    const color = getColor(e.action)
                    const icon = getIcon(e.action)
                    return (
                      <tr key={e.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                          {timeLabel(e.ts)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 14 }}>{icon}</span>
                            <span style={{
                              display: 'inline-flex', padding: '2px 8px', borderRadius: 5,
                              fontSize: 12, fontWeight: 500,
                              background: color + '15', color,
                              border: '1px solid ' + color + '30',
                              whiteSpace: 'nowrap',
                            }}>{e.action}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--ink-2)', maxWidth: 340 }}>
                          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11.5 }}>{e.details}</span>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--ink-3)', fontSize: 12 }}>
                          {e.userName ?? <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', textAlign: 'center' }}>
          Лог хранится в браузере (localStorage) · максимум 300 записей
        </div>
      </div>
    </div>
  )
}
