'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clearAuth } from './AuthGuard'

import { NAV as NAV_ITEMS, GROUPS } from '@/lib/nav'

/**
 * Боковое меню.
 *
 * Две правки по существу.
 *
 * Первая: активный раздел больше не заливается сплошным светлым блоком. На
 * тёмном фоне белый прямоугольник — самое яркое пятно на экране, и глаз
 * цепляется за меню вместо цифр. Теперь это мягкая подложка акцента и
 * полоска слева: видно, где вы, и не слепит.
 *
 * Вторая: список прокручивается. Разделов двадцать два, в экран ноутбука они
 * не помещаются — нижние просто обрезались, и «Рассылка» была видна наполовину.
 * Прокрутка своя, а не общая со страницей: меню должно оставаться на месте,
 * когда вы листаете таблицу.
 *
 * Плюс группировка. Двадцать два пункта подряд не читаются: глаз ищет нужный
 * перебором. Шесть групп по три-пять — просматриваются целиком.
 */

const ICONS: Record<string, any> = {
  grid: IconGrid,
  summary: IconGrid,
  users: IconUsers,
  clock: IconClock,
  jobs: IconJobs,
  phone: IconGrid,
  ticket: IconTicket,
  chat: IconChat,
  match: IconMatch,
  pulse: IconPulse,
  star: IconStar,
  review: IconReview,
  shield: IconShield,
  bell: IconBell,
  funnel: IconFunnel,
  cohort: IconCohort,
  geo: IconGeo,
}

export default function Sidebar() {
  const rawPath = usePathname()
  const path = rawPath.replace(/\/$/, '') || '/'

  return (
    <aside style={{
      position: 'sticky', top: 0, height: '100vh',
      display: 'flex', flexDirection: 'column', minHeight: 0,
      background: 'var(--bg-elev)',
      borderRight: '1px solid var(--line)',
    }}>
      {/* Шапка меню */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 14px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 'var(--radius-sm)', flexShrink: 0,
          background: 'var(--accent)', color: '#14100C',
          display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13,
        }}>J</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)' }}>JobToo</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>Аналитика</div>
        </div>
      </div>

      {/* Разделы. Прокручивается только этот кусок. */}
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '6px 8px 16px' }}>
        {GROUPS.map(group => {
          const items = NAV_ITEMS.filter(n => n.group === group)
          if (!items.length) return null
          return (
            <div key={group} style={{ marginTop: 10 }}>
              <div style={{
                padding: '8px 10px 6px', fontSize: 10.5, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--ink-3)',
              }}>{group}</div>

              {items.map(({ href, label, icon }) => {
                const Icon = ICONS[icon] ?? IconGrid
                const active = path === href
                return (
                  <Link key={href} href={href} className={`jt-nav${active ? ' is-active' : ''}`}>
                    <span className="jt-nav-rail" aria-hidden="true" />
                    <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
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
function IconClock({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.4 1.6"/></svg>
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
function IconReview({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M8 2.5l1.2 2.4 2.7.4-2 1.9.5 2.7L8 8.6 5.6 9.9l.5-2.7-2-1.9 2.7-.4L8 2.5z"/><path d="M3 12.5h10M3 14.5h6"/></svg>
}
function IconShield({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5L2.5 4v4c0 3 2.5 5.5 5.5 6 3-0.5 5.5-3 5.5-6V4L8 1.5z"/></svg>
}
function IconPhone({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M5.5 2H3a1 1 0 0 0-1 1c0 6 5 11 11 11a1 1 0 0 0 1-1v-2.5l-3-1-1.5 1.5a9 9 0 0 1-4-4L7 5.5 5.5 2z"/></svg>
}
function IconBell({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3 1 4 1 4H2.5s1-1 1-4A4.5 4.5 0 0 1 8 1.5z"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0"/></svg>
}
function IconTicket({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M1 5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1.5 1.5 0 0 0 0 3v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-2a1.5 1.5 0 0 0 0-3V5z"/></svg>
}
function IconActivity({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M2 8h2.5l1-3 2 7 1.5-5H14"/><circle cx="2" cy="8" r=".5" fill="currentColor"/></svg>
}
function IconInbox({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M2 9h3l1 2h4l1-2h3"/><rect x="2" y="3" width="12" height="10" rx="1.5"/></svg>
}
function IconFunnel({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M2 2h12l-4.5 5.5V13l-3-1.5V7.5L2 2z"/></svg>
}
function IconCohort({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><rect x="2" y="2" width="3" height="3" rx=".5"/><rect x="7" y="2" width="3" height="3" rx=".5"/><rect x="12" y="2" width="2" height="3" rx=".5"/><rect x="2" y="7" width="3" height="3" rx=".5"/><rect x="7" y="7" width="3" height="3" rx=".5"/><rect x="2" y="12" width="3" height="2" rx=".5"/></svg>
}
function IconGeo({ style }: { style?: React.CSSProperties }) {
  return <svg viewBox="0 0 16 16" style={style} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"><path d="M8 1.5a4 4 0 0 1 4 4c0 3-4 9-4 9s-4-6-4-9a4 4 0 0 1 4-4z"/><circle cx="8" cy="5.5" r="1.5"/></svg>
}
