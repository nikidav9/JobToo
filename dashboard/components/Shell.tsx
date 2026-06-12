'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { isAuthed } from '@/lib/auth'

function getBase(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.startsWith('/JobToo') ? '/JobToo' : ''
}

function isOnLoginPage(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/$/, '').endsWith('/login')
}

const NAV = [
  { href: '/', label: 'Обзор', icon: IconGrid },
  { href: '/users', label: 'Юзеры', icon: IconUsers },
  { href: '/vacancies', label: 'Вакансии', icon: IconJobs },
  { href: '/matching', label: 'Матчи', icon: IconMatch },
  { href: '/engagement', label: 'Активность', icon: IconPulse },
  { href: '/quality', label: 'Качество', icon: IconStar },
  { href: '/chats', label: 'Чаты', icon: IconChat },
  { href: '/reviews', label: 'Отзывы', icon: IconReview },
  { href: '/moderation', label: 'Модерация', icon: IconShield },
  { href: '/tickets', label: 'Тикеты', icon: IconTicket },
  { href: '/broadcast', label: 'Рассылка', icon: IconBell },
  { href: '/funnel', label: 'Воронка', icon: IconFunnel },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const rawPath = usePathname()
  const path = rawPath.replace(/\/$/, '') || '/'
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    if (isOnLoginPage()) {
      setAuthed(true)
      return
    }
    if (isAuthed()) {
      setAuthed(true)
    } else {
      window.location.replace(getBase() + '/login/')
    }
  }, [])

  if (path === '/login' || isOnLoginPage()) {
    return <>{children}</>
  }

  if (authed === null) {
    return <div style={{ minHeight: '100vh', background: '#FAFAF7' }} />
  }

  return (
    <>
      <div className="shell-layout">
        <div className="sidebar-desktop">
          <Sidebar />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar />
          <main style={{ flex: 1 }}>
            {children}
          </main>
        </div>
      </div>

      <nav className="mobile-nav" style={{ overflowX: 'auto', justifyContent: 'flex-start' }}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`mobile-nav-item${active ? ' active' : ''}`}
              style={{ flexShrink: 0 }}
            >
              <span style={{
                display: 'grid', placeItems: 'center',
                width: 36, height: 26, borderRadius: 8,
                background: active ? 'var(--accent-soft)' : 'transparent',
                transition: 'background .12s',
              }}>
                <Icon style={{ width: 18, height: 18, color: active ? 'var(--accent)' : 'var(--ink-4)' }} />
              </span>
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}

function IconGrid({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
}
function IconUsers({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="6" r="2.4"/><path d="M2 13c.6-2 2-3 4-3s3.4 1 4 3" strokeLinecap="round"/><circle cx="11.5" cy="5.5" r="1.8"/><path d="M10 10.2c2 .1 3.4 1 4 2.8" strokeLinecap="round"/></svg>
}
function IconJobs({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="5" width="12" height="9" rx="1.5"/><path d="M6 5V3.5C6 3 6.4 2.5 7 2.5h2c.6 0 1 .5 1 1V5"/></svg>
}
function IconChat({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M13 2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2l3 3 3-3h2a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>
}
function IconReview({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M8 2.5l1.2 2.4 2.7.4-2 1.9.5 2.7L8 8.6 5.6 9.9l.5-2.7-2-1.9 2.7-.4L8 2.5z"/><path d="M3 12.5h10M3 14.5h6"/></svg>
}
function IconMatch({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 13.5 3 9a3 3 0 0 1 5-3 3 3 0 0 1 5 3l-5 4.5z"/></svg>
}
function IconPulse({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M2 8h2.5l1.5-4 2 8 1.5-4H14"/></svg>
}
function IconStar({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 2.5l1.7 3.4 3.8.6-2.7 2.6.6 3.7L8 11.1l-3.4 1.8.6-3.7L2.5 6.5l3.8-.6L8 2.5z"/></svg>
}
function IconShield({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5L2.5 4v4c0 3 2.5 5.5 5.5 6 3-0.5 5.5-3 5.5-6V4L8 1.5z"/></svg>
}
function IconTicket({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M1 5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1.5 1.5 0 0 0 0 3v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-2a1.5 1.5 0 0 0 0-3V5z"/></svg>
}
function IconBell({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3 1 4 1 4H2.5s1-1 1-4A4.5 4.5 0 0 1 8 1.5z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></svg>
}
function IconFunnel({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M2 2h12l-4.5 5.5V13l-3-1.5V7.5L2 2z"/></svg>
}
function IconActivity({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"><path d="M2 8h2.5l1-3 2 7 1.5-5H14"/><circle cx="2" cy="8" r=".5" fill="currentColor"/></svg>
}
