'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const SESSION_KEY = 'jm_session'

export function setAuth() {
  sessionStorage.setItem(SESSION_KEY, '1')
}

export function clearAuth() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function isAuthed() {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

function getBasePath() {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.includes('/JobMatch') ? '/JobMatch' : ''
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isLogin = path === '/login'
    if (isLogin) {
      setReady(true)
      return
    }
    if (!isAuthed()) {
      window.location.replace(getBasePath() + '/login/')
    } else {
      setReady(true)
    }
  }, [path])

  if (!ready && path !== '/login') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #FAFAF7)' }} />
  )
  return <>{children}</>
}
