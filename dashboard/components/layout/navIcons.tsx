/**
 * Значки разделов.
 *
 * Раньше этот набор лежал дважды: своей копией в боковом меню и своей — в
 * нижнем. Копии разошлись молча, и часть разделов на телефоне оказалась без
 * значка. Теперь набор один, и меню берут его отсюда.
 *
 * Имена совпадают с полем `icon` в lib/nav.ts. Отсутствующий значок
 * подменяется нейтральным: раздел без картинки читается, меню без раздела —
 * нет.
 */
import type { CSSProperties, ReactElement } from 'react'

type Props = { className?: string; style?: CSSProperties }

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
} as const

export const IconGrid = (p: Props) => (
  <svg {...base} {...p}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
)
export const IconSummary = (p: Props) => (
  <svg {...base} strokeLinecap="round" {...p}><path d="M2.5 13.5v-4M6.2 13.5V6.5M9.8 13.5V9M13.5 13.5v-9" /></svg>
)
export const IconUsers = (p: Props) => (
  <svg {...base} {...p}><circle cx="6" cy="6" r="2.4" /><path d="M2 13c.6-2 2-3 4-3s3.4 1 4 3" strokeLinecap="round" /><circle cx="11.5" cy="5.5" r="1.8" /><path d="M10 10.2c2 .1 3.4 1 4 2.8" strokeLinecap="round" /></svg>
)
export const IconJobs = (p: Props) => (
  <svg {...base} {...p}><rect x="2" y="5" width="12" height="9" rx="1.5" /><path d="M6 5V3.5C6 3 6.4 2.5 7 2.5h2c.6 0 1 .5 1 1V5" /></svg>
)
export const IconChat = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M13 2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2l3 3 3-3h2a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" /></svg>
)
export const IconReview = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M8 2.5l1.2 2.4 2.7.4-2 1.9.5 2.7L8 8.6 5.6 9.9l.5-2.7-2-1.9 2.7-.4L8 2.5z" /><path d="M3 12.5h10M3 14.5h6" /></svg>
)
export const IconMatch = (p: Props) => (
  <svg {...base} strokeLinejoin="round" {...p}><path d="M8 13.5 3 9a3 3 0 0 1 5-3 3 3 0 0 1 5 3l-5 4.5z" /></svg>
)
export const IconClock = (p: Props) => (
  <svg {...base} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" {...p}><circle cx="8" cy="8" r="5.8" /><path d="M8 4.6V8l2.4 1.6" /></svg>
)
export const IconPulse = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M2 8h2.5l1.5-4 2 8 1.5-4H14" /></svg>
)
export const IconStar = (p: Props) => (
  <svg {...base} strokeLinejoin="round" {...p}><path d="M8 2.5l1.7 3.4 3.8.6-2.7 2.6.6 3.7L8 11.1l-3.4 1.8.6-3.7L2.5 6.5l3.8-.6L8 2.5z" /></svg>
)
export const IconShield = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M8 1.5L2.5 4v4c0 3 2.5 5.5 5.5 6 3-.5 5.5-3 5.5-6V4L8 1.5z" /></svg>
)
export const IconTicket = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M1 5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1.5 1.5 0 0 0 0 3v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-2a1.5 1.5 0 0 0 0-3V5z" /></svg>
)
export const IconBell = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3 1 4 1 4H2.5s1-1 1-4A4.5 4.5 0 0 1 8 1.5z" /><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" /></svg>
)
export const IconFunnel = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M2 2h12l-4.5 5.5V13l-3-1.5V7.5L2 2z" /></svg>
)
export const IconCohort = (p: Props) => (
  <svg {...base} {...p}><rect x="2" y="2" width="3" height="3" rx=".5" /><rect x="7" y="2" width="3" height="3" rx=".5" /><rect x="12" y="2" width="2" height="3" rx=".5" /><rect x="2" y="7" width="3" height="3" rx=".5" /><rect x="7" y="7" width="3" height="3" rx=".5" /><rect x="2" y="12" width="3" height="2" rx=".5" /></svg>
)
export const IconGeo = (p: Props) => (
  <svg {...base} strokeLinejoin="round" strokeLinecap="round" {...p}><path d="M8 1.5a4 4 0 0 1 4 4c0 3-4 9-4 9s-4-6-4-9a4 4 0 0 1 4-4z" /><circle cx="8" cy="5.5" r="1.5" /></svg>
)
export const IconLock = (p: Props) => (
  <svg {...base} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
)

export const NAV_ICONS: Record<string, (p: Props) => ReactElement> = {
  grid: IconGrid,
  summary: IconSummary,
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

export function navIcon(name: string) {
  return NAV_ICONS[name] ?? IconGrid
}
