'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clearAuth } from './AuthGuard'

const NAV = [
  { href: '/',           icon: IconGrid,   label: 'Обзор' },
  { href: '/users',      icon: IconUsers,  label: 'Пользователи' },
  { href: '/vacancies',  icon: IconJobs,   label: 'Вакансии' },
  { href: '/matching',   icon: IconMatch,  label: 'Совпадения' },
  { href: '/engagement', icon: IconPulse,  label: 'Активность' },
  { href: '/quality',    icon: IconStar,   label: 'Качество' },
  { href: '/chats',      icon: IconChat,   label: 'Переписки' },
]

export default function Sidebar() {
  const path = usePathname()

  function logout() {
    clearAuth()
    window.location.href = window.location.origin + (window.location.pathname.includes('/JobMatch') ? '/JobMatch/login/' : '/login/')
  }
  return (
    <aside style={{
      background: 'var(--bg-elev)',
      borderRight: '1px solid var(--line)',
      position: 'sticky',
      top: 0,
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Brand */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)' }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'var(--ink)', color: 'var(--bg)',
          display: 'grid', placeItems: 'center',
          fontWeight: 700, fontSize: 13, letterSpacing: '-0.02em',
        }}>J</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: '-0.01em', color: 'var(--ink)' }}>JobToo</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>Аналитика · Admin</div>
        </div>
      </div>

      {/* Section */}
      <div style={{ padding: '14px 12px 6px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 500 }}>
        Дашборд
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px' }}>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 6,
              color: active ? 'var(--bg)' : 'var(--ink-2)',
              background: active ? 'var(--ink)' : 'transparent',
              fontSize: 13, fontWeight: 450,
              textDecoration: 'none',
              transition: 'background .12s, color .12s',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunken)'; (e.currentTarget as HTMLElement).style.color = active ? 'var(--bg)' : 'var(--ink)' }}
            onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)' } }}
            >
              <Icon style={{ width: 16, height: 16, flexShrink: 0, color: active ? 'var(--bg)' : 'var(--ink-3)' }} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Reports section */}
      <div style={{ padding: '18px 12px 6px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 500 }}>
        Отчёты
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 8px' }}>
        {['Воронка', 'Когорты', 'Гео'].map(label => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 10px', borderRadius: 6,
            color: 'var(--ink-3)', fontSize: 13, fontWeight: 450, cursor: 'default',
          }}>
            <span style={{ width: 16, textAlign: 'center', color: 'var(--ink-4)', fontSize: 10 }}>•</span>
            <span>{label}</span>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        marginTop: 'auto', padding: '12px 14px',
        borderTop: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 11.5, color: 'var(--ink-3)',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), #7D2D0E)',
          display: 'grid', placeItems: 'center',
          color: '#fff', fontWeight: 600, fontSize: 11, flexShrink: 0,
        }}>N</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--ink)', fontWeight: 500, fontSize: 12 }}>nikidav23</span>
          <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>Admin</span>
        </div>
        <button
          onClick={logout}
          title="Выйти"
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'var(--ink-4)', padding: 4, borderRadius: 4,
            display: 'grid', placeItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--ink)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--ink-4)'}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3M10 11l3-3-3-3M13 8H6"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}

function IconGrid({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
}
function IconUsers({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6" cy="6" r="2.4"/><path d="M2 13c.6-2 2-3 4-3s3.4 1 4 3" strokeLinecap="round"/><circle cx="11.5" cy="5.5" r="1.8"/><path d="M10 10.2c2 .1 3.4 1 4 2.8" strokeLinecap="round"/></svg>
}
function IconJobs({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="2" y="5" width="12" height="9" rx="1.5"/><path d="M6 5V3.5C6 3 6.4 2.5 7 2.5h2c.6 0 1 .5 1 1V5"/></svg>
}
function IconMatch({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M8 13.5 3 9a3 3 0 0 1 5-3 3 3 0 0 1 5 3l-5 4.5z"/></svg>
}
function IconPulse({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M2 8h2.5l1.5-4 2 8 1.5-4H14"/></svg>
}
function IconStar({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M8 2.5l1.7 3.4 3.8.6-2.7 2.6.6 3.7L8 11.1l-3.4 1.8.6-3.7L2.5 6.5l3.8-.6L8 2.5z"/></svg>
}
function IconChat({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M13 2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2l3 3 3-3h2a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>
}
