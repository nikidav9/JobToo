'use client'
import { useCallback, useState } from 'react'
import { supabaseAdmin } from '@/lib/supabase'
import { useRealtime } from '@/lib/useRealtime'
import PageHeader from '@/components/PageHeader'
import PageSkeleton from '@/components/PageSkeleton'
import { blockUser, sendSystemMessage } from '@/lib/admin-actions'
import { fetchChats } from '@/lib/queries'
import KpiCard from '@/components/KpiCard'
import Button from '@/components/Button'
import Chip from '@/components/Chip'
import FilterChips from '@/components/FilterChips'
import { IconSend, IconUser, IconCheck, IconX, IconBan } from '@/components/icons'

/** Статусы приходят из базы по-английски. Показывать их как есть нельзя:
 *  панель русская, а «dismissed» ничего не говорит тому, кто её открыл. */
const STATUS_LABEL: Record<string, string> = {
  pending: 'Новая',
  resolved: 'Решена',
  dismissed: 'Отклонена',
  reviewing: 'Разбираем',
}

async function fetchModeration() {
  const [{ data: complaints }, { data: users }] = await Promise.all([
    supabaseAdmin.from('jm_complaints').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('jm_users').select('id,first_name,last_name,phone,role,is_blocked'),
  ])

  const userMap: Record<string, any> = {}
  for (const u of users ?? []) userMap[u.id] = u

  function uName(u: any) {
    if (!u) return '—'
    const n = [u.first_name, u.last_name].filter(Boolean).join(' ')
    return n || u.phone || '—'
  }

  const list = (complaints ?? []).map((c: any) => ({
    id: c.id,
    type: c.complaint_type ?? '—',
    description: c.description ?? '—',
    reporterId: c.reporter_id ?? null,
    targetId: c.target_id ?? null,
    reporterName: uName(userMap[c.reporter_id]),
    reporterPhone: c.reporter_phone ?? userMap[c.reporter_id]?.phone ?? '—',
    targetName: uName(userMap[c.target_id]),
    targetPhone: c.target_phone ?? userMap[c.target_id]?.phone ?? '—',
    targetBlocked: userMap[c.target_id]?.is_blocked ?? false,
    status: c.status ?? 'pending',
    date: c.created_at?.slice(0, 10) ?? '',
  }))

  return { list }
}

type Status = 'idle' | 'loading' | 'ok' | 'err'

export default function ModerationPage() {
  const fetcher = useCallback(() => fetchModeration(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_complaints', 'jm_users'],
    intervalSec: 30,
  })

  const chatsFetcher = useCallback(() => fetchChats(), [])
  const { data: chats } = useRealtime(chatsFetcher, { tables: ['jm_chats'], intervalSec: 60 })

  const [status, setStatus] = useState<Record<string, { s: Status; msg?: string }>>({})
  const [sysMsgChat, setSysMsgChat] = useState('')
  const [sysMsgText, setSysMsgText] = useState('')
  const [sysMsgStatus, setSysMsgStatus] = useState<Status>('idle')
  const [tab, setTab] = useState<'pending' | 'done' | 'all'>('pending')

  function setS(id: string, s: Status, msg?: string) {
    setStatus(prev => ({ ...prev, [id]: { s, msg } }))
  }

  async function handleBlock(c: any) {
    setS(c.id, 'loading')
    try {
      await blockUser(c.targetId, !c.targetBlocked)
      setS(c.id, 'ok', c.targetBlocked ? 'Разблокирован' : 'Заблокирован')
      setTimeout(refresh, 800)
    } catch (e: any) {
      setS(c.id, 'err', e.message)
    }
  }

  async function handleSysMsg() {
    if (!sysMsgChat || !sysMsgText.trim()) return
    setSysMsgStatus('loading')
    try {
      await sendSystemMessage(sysMsgChat, sysMsgText.trim())
      setSysMsgStatus('ok')
      setSysMsgText('')
      setTimeout(() => setSysMsgStatus('idle'), 2000)
    } catch (e: any) {
      setSysMsgStatus('err')
    }
  }

  if (loading || !d) return <PageSkeleton rows={2} />

  const pending = d.list.filter((c: any) => c.status === 'pending')
  const resolved = d.list.filter((c: any) => c.status !== 'pending')
  const blockedTargets = new Set(
    d.list.filter((c: any) => c.targetBlocked && c.targetId).map((c: any) => c.targetId),
  ).size

  // Заголовок обещал «столько-то новых», а под ним шёл весь список целиком —
  // и решённые вперемешку с новыми. Теперь что выбрано, то и показывается.
  const shown = tab === 'pending' ? pending : tab === 'done' ? resolved : d.list

  return (
    <div>
      <PageHeader title="Модерация" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
      <div className="page-content">

        <div className="g-3">
          <KpiCard label="Новые жалобы" value={pending.length}
            sub={d.list.length ? `из ${d.list.length} за всё время` : 'жалоб не поступало'} />
          <KpiCard label="Разобрано" value={resolved.length}
            sub={d.list.length ? `${Math.round(resolved.length / d.list.length * 100)}% всех жалоб` : '—'} />
          <KpiCard label="Заблокировано по жалобам" value={blockedTargets}
            sub="людей, на которых жаловались" />
        </div>

        {/* System message sender */}
        <div className="jt-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
            <IconSend size={14} />Системное сообщение в чат
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={sysMsgChat}
              onChange={e => setSysMsgChat(e.target.value)}
              className="jt-input" style={{ flex: '0 0 260px' }}
            >
              <option value="">— Выберите чат —</option>
              {(chats ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.workerName} ↔ {c.employerName} · {c.vacTitle}</option>
              ))}
            </select>
            <input
              placeholder="Текст системного сообщения..."
              value={sysMsgText}
              onChange={e => setSysMsgText(e.target.value)}
              className="jt-input" style={{ flex: 1, minWidth: 200 }}
            />
            <Button
              variant={sysMsgStatus === 'err' ? 'danger' : 'primary'}
              onClick={handleSysMsg}
              disabled={!sysMsgChat || !sysMsgText.trim() || sysMsgStatus === 'loading'}
              icon={sysMsgStatus === 'ok' ? <IconCheck size={13} /> : sysMsgStatus === 'err' ? <IconX size={13} /> : undefined}
            >
              {sysMsgStatus === 'loading' ? 'Отправка…'
                : sysMsgStatus === 'ok' ? 'Отправлено'
                : sysMsgStatus === 'err' ? 'Не отправилось'
                : 'Отправить'}
            </Button>
          </div>
        </div>

        {/* Complaints */}
        <FilterChips
          options={[
            { key: 'pending' as const, label: 'Новые', count: pending.length },
            { key: 'done' as const, label: 'Разобранные', count: resolved.length },
            { key: 'all' as const, label: 'Все', count: d.list.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              {d.list.length === 0 ? 'Жалоб не поступало' : 'В этом срезе пусто'}
            </div>
          )}
          {shown.map((c: any) => {
            const st = status[c.id]
            const isDone = c.status !== 'pending'
            return (
              <div key={c.id} className="jt-card" style={{
                padding: '14px 16px',
                // Разобранная жалоба уходит фоном, а не прозрачностью: её всё
                // ещё читают, когда сверяются с историей по человеку.
                background: isDone ? 'var(--bg-sunken)' : 'var(--bg-elev)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink-3)' }}>
                        {c.type}
                      </span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.date}</span>
                      <Chip tone={isDone ? 'positive' : 'accent'}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </Chip>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 10, lineHeight: 1.55 }}>
                      {c.description}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <IconUser size={12} />От:&nbsp;
                        <strong style={{ color: 'var(--ink)' }}>{c.reporterName}</strong>
                        <span className="num">{c.reporterPhone}</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <IconUser size={12} />На:&nbsp;
                        <strong style={{ color: c.targetBlocked ? 'var(--negative)' : 'var(--ink)' }}>{c.targetName}</strong>
                        <span className="num">{c.targetPhone}</span>
                        {c.targetBlocked && <Chip tone="negative"><IconBan size={11} />Заблокирован</Chip>}
                      </span>
                    </div>
                  </div>
                  {c.targetId && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {/* Отказ раньше показывался зелёным: ветка «есть результат»
                          красила в positive и успех, и ошибку. */}
                      {st?.s === 'ok' ? (
                        <span style={{ fontSize: 13, color: 'var(--positive)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <IconCheck size={13} />{st.msg}
                        </span>
                      ) : st?.s === 'err' ? (
                        <span style={{ fontSize: 13, color: 'var(--negative)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <IconX size={13} />{st.msg}
                        </span>
                      ) : (
                        <Button
                          variant={c.targetBlocked ? 'secondary' : 'danger'}
                          disabled={st?.s === 'loading'}
                          onClick={() => handleBlock(c)}
                        >
                          {st?.s === 'loading' ? '…' : c.targetBlocked ? 'Разблокировать' : 'Заблокировать'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

