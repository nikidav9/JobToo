'use client'
import { useCallback } from 'react'
import { getToken } from '@/lib/adminApi'
import { useRealtime } from '@/lib/useRealtime'
import { PALETTE } from '@/lib/queries'
import PageHeader from '@/components/PageHeader'
import PageSkeleton from '@/components/PageSkeleton'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { AXIS, GRID, TT } from '@/lib/chart'

/**
 * Доступность сайта.
 *
 * Показывает то, чего не хватало, когда «сайт то работает, то нет»: аптайм за
 * сутки/неделю/месяц, текущее состояние всех служб и список провалов с
 * причиной. Данные — из серверного сэмплера (минутная история), читаются через
 * /api/admin/health. Страница обновляется раз в 30 минут (сервер снимает
 * состояние каждую минуту), кнопка «Обновить» — под рукой.
 *
 * Отдельно от внешнего GitHub-мониторинга: тот бьёт из-за границы по статике и
 * раз в 5 минут — короткий провал после деплоя он пропускает и пишет «зелено».
 * Здесь замер локальный и поминутный, ровно тот путь, что нужен пользователю.
 */

type Health = {
  empty?: boolean
  note?: string
  now?: {
    time: string; up: boolean; nginx: string; site: string; api: string
    rest: string; storage: string; realtime: string; ipv6: string
    ms: number; mem: string; memPct: number | null; swap: string; load: string; event: string
  }
  uptime?: {
    d1: number | null; d7: number | null; d30: number | null
    samplesD1: number; samplesD7: number; samplesD30: number
  }
  series?: { t: string; ms: number; up: number; mem: number | null }[]
  incidents?: { from: string; to: string; minutes: number; detail: string }[]
  incidentsTotal?: number
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/admin/health', {
    headers: { 'X-Admin-Token': getToken() },
    cache: 'no-store',
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? 'Не удалось загрузить состояние')
  return data
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase',
      letterSpacing: '.1em', color: 'var(--ink-3)', margin: '10px 0 -4px 2px',
    }}>{children}</div>
  )
}

// Код службы → тон. 200 хорошо; для api/realtime штатны 400/401/403/405 (жив);
// 000 и 5xx — беда; прочее нейтрально.
function tone(code: string, aliveNon200 = false): 'pos' | 'neg' | 'neutral' {
  if (code === '200') return 'pos'
  if (code === '000' || /^5/.test(code)) return 'neg'
  if (aliveNon200 && /^4/.test(code)) return 'pos'
  return 'neutral'
}

function StatusChip({ label, value, t }: { label: string; value: string; t: 'pos' | 'neg' | 'neutral' }) {
  const c = t === 'pos'
    ? { color: 'var(--positive)', bg: 'var(--positive-soft)', border: 'var(--positive-line)' }
    : t === 'neg'
    ? { color: 'var(--negative)', bg: 'var(--negative-soft)', border: 'var(--negative-line)' }
    : { color: 'var(--ink-2)', bg: 'var(--bg-sunken)', border: 'var(--line)' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      padding: '9px 12px', borderRadius: 'var(--radius-sm)',
      background: c.bg, border: `1px solid ${c.border}`,
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: c.color }}>{value}</span>
    </div>
  )
}

export default function HealthPage() {
  const fetcher = useCallback(() => fetchHealth(), [])
  const { data: d, loading, error, lastUpdated, pulse, refresh } = useRealtime(fetcher, {
    intervalSec: 1800, // 30 минут
  })

  if (loading && !d) return <PageSkeleton rows={3} />

  if (error && !d) {
    return (
      <div>
        <PageHeader title="Доступность" lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
        <div className="page-content">
          <ChartCard title="Не удалось получить состояние" sub="Сервер мониторинга не ответил">
            <div style={{ fontSize: 13, color: 'var(--negative)', padding: '4px 0 8px' }}>{error}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              Данные пишет серверный сэмплер (health-sample.sh) раз в минуту. Если ошибка держится —
              проверьте, что nginx отдаёт /health-history.ndjson и что таймер jt-health-sample активен.
            </div>
          </ChartCard>
        </div>
      </div>
    )
  }

  if (d?.empty) {
    return (
      <div>
        <PageHeader title="Доступность" lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />
        <div className="page-content">
          <ChartCard title="История ещё накапливается" sub="Сэмплер пишет раз в минуту">
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{d.note}</div>
          </ChartCard>
        </div>
      </div>
    )
  }

  const now = d?.now
  const up = d?.uptime
  const series = d?.series ?? []
  const incidents = d?.incidents ?? []
  const upVal = (v: number | null | undefined) => (v === null || v === undefined ? null : `${v}%`)
  const upTone = (v: number | null | undefined): 'pos' | 'neg' | 'neutral' =>
    v === null || v === undefined ? 'neutral' : v >= 99.5 ? 'pos' : v >= 97 ? 'neutral' : 'neg'

  return (
    <div>
      <PageHeader title="Доступность" lastUpdated={lastUpdated} pulse={pulse} onRefresh={refresh} />

      <div className="page-content">

        {/* Крупный статус «прямо сейчас» */}
        {now && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px 18px', borderRadius: 'var(--radius)',
            background: now.up ? 'var(--positive-soft)' : 'var(--negative-soft)',
            border: `1px solid ${now.up ? 'var(--positive-line)' : 'var(--negative-line)'}`,
          }}>
            <span aria-hidden="true" style={{
              width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
              background: now.up ? 'var(--positive)' : 'var(--negative)',
              boxShadow: `0 0 0 4px ${now.up ? 'var(--positive-line)' : 'var(--negative-line)'}`,
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: now.up ? 'var(--positive)' : 'var(--negative)' }}>
                {now.up ? 'Сайт работает' : 'Сайт недоступен'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
                Последний замер: {now.time} · ответ {now.ms} мс
                {now.event ? ` · ${now.event}` : ''}
              </div>
            </div>
          </div>
        )}

        <SectionTitle>Аптайм · локальный поминутный замер</SectionTitle>
        <div className="g-4">
          <KpiCard label="За 24 часа" value={upVal(up?.d1)}
            sub={`${up?.samplesD1 ?? 0} замеров`} sparkColor={PALETTE.green}
            deltaTone={upTone(up?.d1)} />
          <KpiCard label="За 7 дней" value={upVal(up?.d7)}
            sub={`${up?.samplesD7 ?? 0} замеров`} sparkColor={PALETTE.cyan}
            deltaTone={upTone(up?.d7)} />
          <KpiCard label="За 30 дней" value={upVal(up?.d30)}
            sub={`${up?.samplesD30 ?? 0} замеров`} sparkColor={PALETTE.blue}
            deltaTone={upTone(up?.d30)} />
          <KpiCard label="Ответ сейчас" value={now ? `${now.ms} мс` : null}
            sub="локальный TLS-vhost" sparkColor={PALETTE.amber} />
        </div>

        {now && (
          <>
            <SectionTitle>Службы · текущее состояние</SectionTitle>
            <div className="g-4" style={{ gridRowGap: 8 }}>
              <StatusChip label="nginx" value={now.nginx} t={now.nginx === 'active' ? 'pos' : 'neg'} />
              <StatusChip label="Сайт (HTML)" value={now.site} t={tone(now.site)} />
              <StatusChip label="API (php)" value={now.api} t={tone(now.api, true)} />
              <StatusChip label="PostgREST" value={now.rest} t={tone(now.rest)} />
              <StatusChip label="Хранилище" value={now.storage} t={tone(now.storage)} />
              <StatusChip label="Realtime" value={now.realtime} t={tone(now.realtime, true)} />
              <StatusChip label="IPv6" value={now.ipv6} t={now.ipv6 === '200' ? 'pos' : now.ipv6 === 'нет' ? 'neutral' : 'neg'} />
              <StatusChip label="Память / подкачка" value={`${now.mem} · ${now.swap}`}
                t={now.memPct !== null && now.memPct >= 92 ? 'neg' : 'neutral'} />
            </div>
          </>
        )}

        <ChartCard title="Время ответа сайта" sub="За 24 часа · локальный замер, мс"
          chip={now ? { label: now.up ? 'сейчас в норме' : 'сейчас недоступен', tone: now.up ? 'pos' : 'neg' } : undefined}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gMs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.cyan} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PALETTE.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} unit=" мс" width={56} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`${v} мс`, 'Ответ']} />
              <Area type="monotone" dataKey="ms" name="Ответ" stroke={PALETTE.cyan} fill="url(#gMs)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Использование памяти" sub="За 24 часа · % занятой RAM (первопричина падений при деплое)">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={series} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE.orange} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={PALETTE.orange} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" width={56} />
              <Tooltip contentStyle={TT} formatter={(v: any) => [`${v}%`, 'Память']} />
              <Area type="monotone" dataKey="mem" name="Память" stroke={PALETTE.orange} fill="url(#gMem)" strokeWidth={2} dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <SectionTitle>Провалы · за 30 дней{d?.incidentsTotal ? ` · всего ${d.incidentsTotal}` : ''}</SectionTitle>
        <div style={{
          background: 'var(--bg-elev)', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
        }}>
          {incidents.length === 0 ? (
            <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--positive)' }}>
              За последние 30 дней провалов не зафиксировано.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-3)' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 500 }}>Начало</th>
                    <th style={{ padding: '10px 14px', fontWeight: 500 }}>Конец</th>
                    <th style={{ padding: '10px 14px', fontWeight: 500 }}>Длительность</th>
                    <th style={{ padding: '10px 14px', fontWeight: 500 }}>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((it, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="mono" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{it.from}</td>
                      <td className="mono" style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{it.to}</td>
                      <td className="mono" style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: it.minutes >= 5 ? 'var(--negative)' : 'var(--ink-2)' }}>
                        {it.minutes} мин
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--ink-2)' }}>{it.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', margin: '4px 2px 0' }}>
          Замер локальный (через loopback), поминутный. Внешний GitHub-мониторинг бьёт из-за границы
          раз в 5 минут по статике и короткие провалы после деплоя пропускает — поэтому здесь картина
          точнее. Страница сама обновляется каждые 30 минут.
        </div>

      </div>
    </div>
  )
}
