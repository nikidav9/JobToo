'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const SESSION_KEY = 'jm_session'

function isAuthed() {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

function isLoginPage() {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/$/, '').endsWith('/login')
}

function redirectToLogin() {
  const base = window.location.pathname.includes('/JobMatch') ? '/JobMatch' : ''
  window.location.replace(base + '/login/')
}

const NAV = [
  { href: '/', label: 'Обзор', icon: IconGrid },
  { href: '/users', label: 'Юзеры', icon: IconUsers },
  { href: '/vacancies', label: 'Вакансии', icon: IconJobs },
  { href: '/chats', label: 'Чаты', icon: IconChat },
  { href: '/reviews', label: 'Отзывы', icon: IconReview },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const rawPath = usePathname()
  const path = rawPath.replace(/\/$/, '') || '/'
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    if (isLoginPage()) {
      setReady(true)
      return
    }
    if (isAuthed()) {
      setAuthed(true)
      setReady(true)
    } else {
      redirectToLogin()
    }
  }, [])

  // Login page — no shell
  if (isLoginPage() || path === '/login') {
    return <>{children}</>
  }

  if (!ready || !authed) {
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

      <nav className="mobile-nav">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`mobile-nav-item${active ? ' active' : ''}`}
            >
              <span style={{
                display: 'grid', placeItems: 'center',
                width: 36, height: 26, borderRadius: 8,
                background: active ? 'var(--accent-soft)' : 'transparent',
                transition: 'background .12s',
              }}>
                <Icon style={{
                  width: 18, height: 18,
                  color: active ? 'var(--accent)' : 'var(--ink-4)',
                }} />
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
