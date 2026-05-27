import Sparkline from './Sparkline'

interface Props {
  label: string
  value: string | number
  sub?: string
  delta?: string
  deltaTone?: 'pos' | 'neg' | 'neutral'
  color?: string
  icon?: string
  spark?: number[]
  sparkColor?: string
}

export default function KpiCard({
  label, value, sub, delta, deltaTone = 'neutral',
  color = 'var(--accent)', icon, spark, sparkColor,
}: Props) {
  const chipColor = deltaTone === 'pos'
    ? { color: 'var(--positive)', bg: 'rgba(46,125,84,.08)', border: 'rgba(46,125,84,.18)' }
    : deltaTone === 'neg'
    ? { color: 'var(--negative)', bg: 'rgba(179,60,42,.08)', border: 'rgba(179,60,42,.18)' }
    : { color: 'var(--ink-3)', bg: 'var(--bg-sunken)', border: 'var(--line)' }

  return (
    <div className="kpi-card" style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-sm)',
      padding: '14px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <div className="kpi-label" style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--ink-3)', fontWeight: 500,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 4,
      }}>
        <span style={{ minWidth: 0, wordBreak: 'break-word', lineHeight: 1.3 }}>{label}</span>
        {icon && <span style={{ fontSize: 14, opacity: 0.55, flexShrink: 0 }}>{icon}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <div className="kpi-value" style={{
          fontFamily: 'Geist, sans-serif',
          fontSize: 30, fontWeight: 500,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--ink)', lineHeight: 1,
        }}>{value}</div>
        {delta && (
          <span className="kpi-delta" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 6px', borderRadius: 999,
            fontSize: 11, fontWeight: 500,
            color: chipColor.color,
            background: chipColor.bg,
            border: `1px solid ${chipColor.border}`,
            whiteSpace: 'nowrap',
          }}>{delta}</span>
        )}
      </div>

      {sub && (
        <div className="kpi-sub" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>{sub}</div>
      )}

      {spark && spark.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <Sparkline data={spark} color={sparkColor ?? color} height={36} />
        </div>
      )}
    </div>
  )
}
