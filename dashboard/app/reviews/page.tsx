'use client'
import { useCallback, useState } from 'react'
import { fetchReviews } from '@/lib/queries'
import { useRealtime } from '@/lib/useRealtime'
import PageHeader from '@/components/PageHeader'
import PageSkeleton from '@/components/PageSkeleton'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import Avatar from '@/components/Avatar'
import Chip from '@/components/Chip'
import FilterChips from '@/components/FilterChips'
import { IconStar, IconMetro, IconCheck } from '@/components/icons'

/** Звёзды рисуются SVG: символ ★ на разных устройствах разной ширины, и
 *  ряд из пяти прыгает по длине от строки к строке. Цвет — акцент, а не
 *  случайный янтарный `#F59E0B`, которого нет в палитре. */
function Stars({ value }: { value: number }) {
  const n = Math.round(value)
  return (
    <span style={{ display: 'inline-flex', gap: 1 }} title={`${value} из 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <IconStar key={i} size={13} filled={i <= n}
          style={{ color: i <= n ? 'var(--accent)' : 'var(--line-strong)' }} />
      ))}
    </span>
  )
}

/** «1 звезда», «2 звезды», «5 звёзд» — иначе подписи фильтра читаются как
 *  машинный перевод. */
function stars(n: number): string {
  if (n === 1) return 'звезда'
  if (n < 5) return 'звезды'
  return 'звёзд'
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Chip tone={role === 'worker' ? 'accent' : 'info'} style={{ fontSize: 11, padding: '1px 7px' }}>
      {role === 'worker' ? 'Работник' : 'Работодатель'}
    </Chip>
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

  if (loading || !d) return <PageSkeleton rows={2} />

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
          <KpiCard label="Всего отзывов" value={d.total} sub="за всё время" />
          <KpiCard label="Средний рейтинг" value={d.avgRating === '—' ? null : d.avgRating}
            sub={d.total ? `из 5 · по ${d.total} отзывам` : 'оценок пока нет'} />
          <KpiCard label="С текстом" value={d.withText} sub={`${d.total ? Math.round(d.withText / d.total * 100) : 0}% отзывов`} />
          <KpiCard label="Только оценка" value={d.total - d.withText}
            sub={`${d.total ? Math.round((d.total - d.withText) / d.total * 100) : 0}% отзывов`} />
        </div>

        {/* Filters + table */}
        <ChartCard
          title="Все отзывы"
          sub={`${filtered.length}${filtered.length !== d.total ? ` из ${d.total}` : ''} записей`}
        >
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <FilterChips
              options={[
                { key: 'all', label: 'Любая оценка', count: d.total },
                ...[5, 4, 3, 2, 1].map(n => ({
                  key: String(n), label: `${n} ${stars(n)}`, count: d.byStars[n] ?? 0,
                })),
              ]}
              value={filterStars === null ? 'all' : String(filterStars)}
              onChange={k => setFilterStars(k === 'all' ? null : Number(k))}
            />
            <FilterChips
              options={[
                { key: 'all', label: 'Все', count: d.total },
                { key: 'worker', label: 'От работников', count: d.byRole.worker },
                { key: 'employer', label: 'От работодателей', count: d.byRole.employer },
              ]}
              value={filterRole}
              onChange={setFilterRole}
            />
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              {d.total === 0 ? 'Отзывов пока нет' : 'Под выбранные фильтры ничего не подошло'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((r: any) => (
                <div key={r.id} className="jt-card" style={{ padding: '14px 16px' }}>
                  {/* Top row: vacancy + rating + date */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* Vacancy badge */}
                      <Chip tone={r.vacType === 'perm' ? 'info' : 'accent'}>
                        {r.vacType === 'perm' ? 'Постоянная' : 'Смена'} · {r.vacCompany} · {r.vacTitle}
                      </Chip>
                      {/* Address */}
                      {(r.vacMetro || r.vacAddress) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-3)' }}>
                          <IconMetro size={12} />
                          {[r.vacMetro, r.vacAddress].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {/* Vacancy status */}
                      {r.vacStatus && (
                        <Chip tone={r.vacStatus === 'closed' ? 'positive' : 'neutral'}>
                          {r.vacStatus === 'closed' ? <><IconCheck size={11} />Закрыта</> : 'Открыта'}
                        </Chip>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <Stars value={r.rating} />
                      <span className="num" style={{ fontSize: 18, fontWeight: 620, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                        {r.rating}
                      </span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        {r.createdAt}
                      </span>
                    </div>
                  </div>

                  {/* People row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {/* From */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={r.fromName} role={r.fromRole} size={28} />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 550, color: 'var(--ink)' }}>{r.fromName}</div>
                        <RoleBadge role={r.fromRole} />
                      </div>
                    </div>

                    {/* Arrow */}
                    <div style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 4px' }}>оставил отзыв о</div>

                    {/* To */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={r.toName} role={r.toRole} size={28} />
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
                    }}>
                      «{r.reviewText}»
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

