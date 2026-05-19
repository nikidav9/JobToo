'use client'
import { useCallback, useState, useEffect, useRef } from 'react'
import { fetchChats } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'

function timeLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'вчера'
  if (diffDays < 7) return d.toLocaleDateString('ru', { weekday: 'short' })
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function Avatar({ initials, color, size = 38 }: { initials: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, color: '#fff',
      display: 'grid', placeItems: 'center',
      fontWeight: 600, fontSize: size * 0.35, flexShrink: 0,
      letterSpacing: '-0.01em',
    }}>{initials}</div>
  )
}

export default function ChatsPage() {
  const fetcher = useCallback(() => fetchChats(), [])
  const { data: chats, loading, refresh } = useRealtime(fetcher, {
    tables: ['jm_chats', 'jm_messages'],
    intervalSec: 15,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selected = chats?.find(c => c.id === selectedId) ?? null

  useEffect(() => {
    if (chats && chats.length > 0 && !selectedId) {
      setSelectedId(chats[0].id)
    }
  }, [chats, selectedId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.id, selected?.messages?.length])

  function openChat(id: string) {
    setSelectedId(id)
    setMobileView('chat')
  }

  if (loading || !chats) return <Loader />

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 41px)', overflow: 'hidden' }}>

      {/* ─── Chat list ─── */}
      <div className={`chat-list-panel${mobileView === 'chat' ? ' mobile-hidden' : ''}`} style={{
        width: 320, minWidth: 320, flexShrink: 0,
        borderRight: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elev)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
              Чаты
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 1 }}>
              {chats.length} переписок
            </div>
          </div>
          <button
            onClick={refresh}
            style={{
              background: 'transparent', border: '1px solid var(--line)', borderRadius: 7,
              padding: '5px 8px', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 8a5.5 5.5 0 1 1-2-4.2M13.5 2.5V5H11"/>
            </svg>
            Обновить
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {chats.map(chat => {
            const active = chat.id === selectedId
            const unread = (chat.unreadWorker ?? 0) + (chat.unreadEmployer ?? 0)
            return (
              <div
                key={chat.id}
                onClick={() => openChat(chat.id)}
                style={{
                  padding: '12px 16px',
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  cursor: 'pointer',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunken)' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {/* Double avatar */}
                <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
                  <Avatar initials={chat.workerInitials} color="#C8501E" size={30} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0 }}>
                    <Avatar initials={chat.employerInitials} color="#3B5BB5" size={22} />
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chat.workerName}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-4)', flexShrink: 0 }}>
                      {chat.lastMessage ? timeLabel(chat.lastMessage.createdAt) : timeLabel(chat.createdAt)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {chat.employerName} · {chat.vacTitle}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {chat.lastMessage
                        ? (chat.lastMessage.text.length > 45
                            ? chat.lastMessage.text.slice(0, 45) + '…'
                            : chat.lastMessage.text)
                        : 'Нет сообщений'}
                    </div>
                    {unread > 0 && (
                      <span style={{
                        background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 600,
                        borderRadius: 999, padding: '1px 6px', marginLeft: 6, flexShrink: 0,
                      }}>{unread}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Conversation ─── */}
      <div className={`chat-convo-panel${mobileView === 'list' ? ' mobile-hidden' : ''}`} style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
      }}>
        {selected ? (
          <>
            {/* Conversation header */}
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--bg-elev)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              {/* Mobile back */}
              <button
                className="chat-back-btn"
                onClick={() => setMobileView('list')}
                style={{
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--ink-3)', padding: '4px 6px 4px 0', display: 'none', alignItems: 'center', gap: 4,
                  fontSize: 13, fontWeight: 500,
                }}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13L5 8l5-5"/>
                </svg>
              </button>

              <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                <Avatar initials={selected.workerInitials} color="#C8501E" size={32} />
                <div style={{ position: 'absolute', bottom: 0, right: 0 }}>
                  <Avatar initials={selected.employerInitials} color="#3B5BB5" size={22} />
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{selected.workerName}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>и</span>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{selected.employerName}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                  <span style={{
                    background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                    borderRadius: 5, padding: '1px 7px', fontSize: 11,
                  }}>{selected.vacTitle}</span>
                  <span style={{ marginLeft: 8, color: 'var(--ink-4)' }}>{selected.messageCount} сообщ.</span>
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                  <Avatar initials={selected.workerInitials} color="#C8501E" size={18} />
                  <span style={{ color: 'var(--ink-3)' }}>Работник</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                  <Avatar initials={selected.employerInitials} color="#3B5BB5" size={18} />
                  <span style={{ color: 'var(--ink-3)' }}>Работодатель</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selected.messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 13, paddingTop: 40 }}>
                  Нет сообщений
                </div>
              )}
              {selected.messages.map((msg: any, i: number) => {
                if (msg.side === 'system') {
                  return (
                    <div key={msg.id} style={{ textAlign: 'center', margin: '8px 0' }}>
                      <span style={{
                        display: 'inline-block', fontSize: 11.5, color: 'var(--ink-4)',
                        background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                        borderRadius: 12, padding: '4px 12px',
                      }}>{msg.text}</span>
                    </div>
                  )
                }

                const isWorker = msg.side === 'worker'
                const prevMsg = i > 0 ? selected.messages[i - 1] : null
                const showName = !prevMsg || prevMsg.side !== msg.side || prevMsg.side === 'system'

                return (
                  <div key={msg.id} style={{
                    display: 'flex',
                    flexDirection: isWorker ? 'row' : 'row-reverse',
                    alignItems: 'flex-end',
                    gap: 8,
                    marginTop: showName ? 10 : 2,
                  }}>
                    {/* Avatar — only on first in group */}
                    <div style={{ width: 28, flexShrink: 0 }}>
                      {showName && (
                        <Avatar
                          initials={isWorker ? selected.workerInitials : selected.employerInitials}
                          color={isWorker ? '#C8501E' : '#3B5BB5'}
                          size={28}
                        />
                      )}
                    </div>

                    <div style={{ maxWidth: '70%', minWidth: 0 }}>
                      {showName && (
                        <div style={{
                          fontSize: 11, fontWeight: 500, marginBottom: 3,
                          color: isWorker ? '#C8501E' : '#3B5BB5',
                          textAlign: isWorker ? 'left' : 'right',
                        }}>
                          {msg.senderName}
                        </div>
                      )}
                      <div style={{
                        background: isWorker ? 'var(--bg-elev)' : '#3B5BB5',
                        color: isWorker ? 'var(--ink)' : '#fff',
                        borderRadius: isWorker ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                        padding: '9px 13px',
                        fontSize: 13.5,
                        lineHeight: 1.45,
                        border: isWorker ? '1px solid var(--line)' : 'none',
                        boxShadow: 'var(--shadow-sm)',
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                      <div style={{
                        fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3,
                        textAlign: isWorker ? 'left' : 'right',
                      }}>
                        {fullTime(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <div style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 14 }}>Выберите чат</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 41px)' }}>
      <div style={{ width: 320, borderRight: '1px solid var(--line)', background: 'var(--bg-elev)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: 64, borderRadius: 10, background: 'var(--bg-sunken)' }} />
        ))}
      </div>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>Загрузка…</div>
      </div>
    </div>
  )
}
