'use client'
import { usePathname } from 'next/navigation'

const LABELS: Record<string, string> = {
  '/': 'Обзор',
  '/users': 'Пользователи',
  '/vacancies': 'Вакансии',
  '/matching': 'Совпадения',
  '/engagement': 'Активность',
  '/quality': 'Качество',
}

export default function Topbar() {
  const path = usePathname()
  const label = LABELS[path] ?? path
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 24px',
      borderBottom: '1px solid var(--line)',
      background: 'rgba(250,250,247,.85)',
      position: 'sticky', top: 0, zIndex: 5,
      backdropFilter: 'saturate(140%) blur(8px)',
      WebkitBackdropFilter: 'saturate(140%) blur(8px)',
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-3)' }}>
        <span>JobMatch</span>
        <span style={{ color: 'var(--ink-4)' }}>/</span>
        <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{label}</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div className="topbar-search" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px', border: '1px solid var(--line)',
        borderRadius: 7, background: 'var(--bg-elev)',
        color: 'var(--ink-3)', fontSize: 12.5, minWidth: 220,
      }}>
        <IconSearch />
        <input
          placeholder="Поиск…"
          style={{ background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', font: 'inherit', flex: 1, fontSize: 12.5 }}
        />
        <span style={{
          fontFamily: 'Geist Mono, monospace', fontSize: 10.5, color: 'var(--ink-3)',
          border: '1px solid var(--line)', padding: '1px 5px', borderRadius: 4, background: 'var(--bg-sunken)',
        }}>⌘K</span>
      </div>
    </header>
  )
}

function IconSearch() {
  return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7" cy="7" r="4"/><path d="M10 10l3 3" strokeLinecap="round"/></svg>
}
