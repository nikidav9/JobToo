'use client'
import { useCallback, useState } from 'react'
import { fetchReviews } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import PageHeader from '@/components/PageHeader'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'

function Stars({ value }: { value: number }) {
  return (
    <span style={{ color: '#F59E0B', fontSize: 14, letterSpacing: 1 }}>
      {'★'.repeat(Math.round(value))}
      <span style={{ color: 'var(--line-strong)' }}>{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const isWorker = role === 'worker'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 500,
      color: isWorker ? 'var(--accent)' : 'var(--info)',
      background: isWorker ? 'var(--accent-soft)' : 'rgba(59,91,181,.08)',
      border: `1px solid ${isWorker ? 'var(--accent-line)' : 'rgba(59,91,181,.18)'}`,
    }}>
      {isWorker ? 'Работник' : 'Работодатель'}
    </span>
  )
}

export default function ReviewsPage() {
  const fetcher = useCallback(() => fetchReviews(), [])
  const { data: d, loading, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    tables: ['jm_ratings'],
    intervalSec: 30,
  })

  const [filterStars, setFilterStars] = useState<number | null>(null)
  const [filterRole, setFilterRole] = useState<string>('all')

  if (loading || !d) return <Loader />

  const filtered = d.list.filter((r: any) => {
    if (filterStars !== null && r.rating !== filterStars) return false
    if (filterRole !== 'all' && r.fromRole !== filterRole) return false
    return true
  })

  return (
    <div>
      <PageHeader title="Отзывы" intervalSec={30} lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">

        {/* KPI */}
        <div className="g-4">
          <KpiCard label="Всего отзывов" value={d.total} />
          <KpiCard label="Средний рейтинг" value={d.avgRating} sub="из 5 звёзд" />
          <KpiCard label="С текстом" value={d.withText} sub={`${d.total ? Math.round(d.withText / d.total * 100) : 0}% отзывов`} />
          <KpiCard label="Без текста" value={d.total - d.withText} />
        </div>

        {/* Filters + table */}
        <ChartCard
          title="Все отзывы"
          sub={`${filtered.length}${filtered.length !== d.total ? ` из ${d.total}` : ''} записей`}
        >
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {/* Stars filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[null, 5, 4, 3, 2, 1].map(s => (
                <button
                  key={String(s)}
                  onClick={() => setFilterStars(s)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                    border: '1px solid var(--line)',
                    background: filterStars === s ? 'var(--ink)' : 'var(--bg-elev)',
                    color: filterStars === s ? 'var(--bg)' : 'var(--ink-3)',
                    transition: 'all .1s',
                  }}
                >
                  {s === null ? 'Все ⭐' : '★'.repeat(s)}
                </button>
              ))}
            </div>

            {/* Role filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[['all', 'Все'], ['worker', 'Работники'], ['employer', 'Работодатели']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilterRole(val)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
                    border: '1px solid var(--line)',
                    background: filterRole === val ? 'var(--ink)' : 'var(--bg-elev)',
                    color: filterRole === val ? 'var(--bg)' : 'var(--ink-3)',
                    transition: 'all .1s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
              Отзывов нет
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((r: any) => (
                <div key={r.id} style={{
                  border: '1px solid var(--line)', borderRadius: 10,
                  padding: '14px 16px', background: 'var(--bg-elev)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {/* Top row: vacancy + rating + date */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* Vacancy badge */}
                      <span style={{
                        background: r.vacType === 'perm' ? 'rgba(59,91,181,.08)' : 'var(--accent-soft)',
                        border: `1px solid ${r.vacType === 'perm' ? 'rgba(59,91,181,.2)' : 'var(--accent-line)'}`,
                        color: r.vacType === 'perm' ? 'var(--info)' : 'var(--accent)',
                        borderRadius: 5, padding: '2px 8px', fontSize: 11.5, fontWeight: 500,
                      }}>
                        {r.vacType === 'perm' ? '💼' : '⚡'} {r.vacCompany} · {r.vacTitle}
                      </span>
                      {/* Address */}
                      {(r.vacMetro || r.vacAddress) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ink-3)' }}>
                          <svg width="9" height="11" viewBox="0 0 10 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 1C3 1 1.5 2.5 1.5 4.5c0 2.5 3.5 7 3.5 7s3.5-4.5 3.5-7C8.5 2.5 7 1 5 1z"/><circle cx="5" cy="4.5" r="1.2"/>
                          </svg>
                          {[r.vacMetro, r.vacAddress].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {/* Vacancy status */}
                      {r.vacStatus && (
                        <span style={{
                          fontSize: 10.5, fontWeight: 500, padding: '2px 6px', borderRadius: 4,
                          background: r.vacStatus === 'closed' ? 'rgba(46,125,84,.08)' : 'rgba(168,112,32,.08)',
                          color: r.vacStatus === 'closed' ? 'var(--positive)' : 'var(--amber)',
                          border: `1px solid ${r.vacStatus === 'closed' ? 'rgba(46,125,84,.2)' : 'rgba(168,112,32,.2)'}`,
                        }}>
                          {r.vacStatus === 'closed' ? '✓ Закрыта' : 'Открыта'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <Stars value={r.rating} />
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontFamily: 'Geist Mono, monospace' }}>
                        {r.rating}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'Geist Mono, monospace' }}>
                        {r.createdAt}
                      </span>
                    </div>
                  </div>

                  {/* People row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {/* From */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: r.fromRole === 'worker' ? 'linear-gradient(135deg,#C8501E,#7D2D0E)' : 'linear-gradient(135deg,#3B5BB5,#1F3A8A)',
                        display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 10,
                      }}>
                        {r.fromName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 550, color: 'var(--ink)' }}>{r.fromName}</div>
                        <RoleBadge role={r.fromRole} />
                      </div>
                    </div>

                    {/* Arrow */}
                    <div style={{ fontSize: 13, color: 'var(--ink-4)', margin: '0 4px' }}>оставил отзыв →</div>

                    {/* To */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: r.toRole === 'worker' ? 'linear-gradient(135deg,#C8501E,#7D2D0E)' : 'linear-gradient(135deg,#3B5BB5,#1F3A8A)',
                        display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 10,
                      }}>
                        {r.toName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 550, color: 'var(--ink)' }}>{r.toName}</div>
                        <RoleBadge role={r.toRole} />
                      </div>
                    </div>
                  </div>

                  {/* Review text */}
                  {r.reviewText && (
                    <div style={{
                      marginTop: 10, padding: '10px 12px',
                      background: 'var(--bg-sunken)', borderRadius: 8,
                      borderLeft: '3px solid var(--line-strong)',
                      fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55,
                      fontStyle: 'italic',
                    }}>
                      "{r.reviewText}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} style={{ height: i === 0 ? 64 : 120, background: 'var(--bg-sunken)', borderRadius: 10 }} />
      ))}
    </div>
  )
}
