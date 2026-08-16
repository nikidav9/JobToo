'use client'
import { useEffect, useState } from 'react'
import { getActivityLog, clearActivityLog, ActivityEntry } from '@/lib/activity-log'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import Button from '@/components/Button'
import Chip, { type Tone } from '@/components/Chip'
import { IconTrash } from '@/components/icons'

/**
 * Тон действия.
 *
 * Раньше здесь было десять собственных hex прошлой палитры, и подложка
 * собиралась приписыванием «15» и «30» к цвету — приём, который к токенам не
 * приводится вовсе. Смысловых тонов хватает: важно не «каким цветом», а
 * «хорошо это или плохо».
 */
const ACTION_TONES: [string, Tone][] = [
  ['Разблокирован', 'positive'],
  ['Заблокирован', 'negative'],
  ['Статус жалобы изменён', 'positive'],
  ['Сброшен пароль', 'accent'],
  ['Пуш отправлен', 'info'],
  ['Рассылка', 'violet'],
  ['Системное сообщение', 'violet'],
  ['Вакансия', 'accent'],
  ['Жалоба', 'neutral'],
]

function toneOf(action: string): Tone {
  for (const [key, tone] of ACTION_TONES) {
    // «Разблокирован» содержит «Заблокирован» — сначала более длинное
    // совпадение, иначе разблокировка красилась бы как блокировка.
    if (action.includes(key)) return tone
  }
  return 'neutral'
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

        <div className="g-3">
          <KpiCard label="Всего записей" value={log.length} sub="хранится не больше 300" />
          <KpiCard label="Сегодня"
            value={log.filter(e => e.ts.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}
            sub="действий за сутки" />
          <KpiCard label="Показано" value={filtered.length}
            sub={filter.trim() ? `по запросу «${filter.trim()}»` : 'без фильтра'} />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Поиск по действию, деталям, имени..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="jt-input" style={{ flex: 1, maxWidth: 360 }}
          />
          <Button variant={confirmClear ? 'danger' : 'secondary'} onClick={handleClear}
            icon={confirmClear ? undefined : <IconTrash size={13} />}>
            {confirmClear ? 'Нажмите ещё раз — записи не вернуть' : 'Очистить лог'}
          </Button>
        </div>

        {/* Log table */}
        <div className="jt-card" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              {log.length === 0 ? 'Лог пуст — действия появятся здесь после блокировок, рассылок и т.д.' : 'Ничего не найдено'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
              <table className="jt-table">
                <thead>
                  <tr>
                    {['Время', 'Действие', 'Детали', 'Пользователь'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id}>
                      <td className="num" style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                        {timeLabel(e.ts)}
                      </td>
                      <td><Chip tone={toneOf(e.action)}>{e.action}</Chip></td>
                      <td className="num" style={{ color: 'var(--ink-2)', maxWidth: 340, fontSize: 12 }}>{e.details}</td>
                      <td style={{ color: 'var(--ink-2)' }}>
                        {e.userName ?? <span style={{ color: 'var(--ink-3)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
          Лог хранится в браузере (localStorage) · максимум 300 записей
        </div>
      </div>
    </div>
  )
}
