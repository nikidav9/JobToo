interface Props {
  title: string
  intervalSec?: number
  lastUpdated?: string
  pulse?: boolean
  onRefresh?: () => void
}

export default function PageHeader({ title, intervalSec, lastUpdated, pulse, onRefresh }: Props) {
  return (
    <div className="page-header" style={{
      padding: '16px 24px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)', margin: 0 }}>
          {title}
        </h1>
        <div className="page-header-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-4)', marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--positive)', display: 'inline-block',
              animation: 'livepulse 1.6s infinite', flexShrink: 0,
            }} />
            <style>{`@keyframes livepulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
            Realtime
          </span>
          <span style={{ color: 'var(--line-strong)' }}>·</span>
          <span>каждые {intervalSec}с</span>
          {lastUpdated && <>
            <span style={{ color: 'var(--line-strong)' }}>·</span>
            <span className="mono">{lastUpdated}</span>
          </>}
        </div>
      </div>

      <button
        onClick={onRefresh}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px', borderRadius: 7, flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--bg-elev)',
          color: 'var(--ink)', font: 'inherit', fontSize: 12, fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
          <path d="M13.5 8a5.5 5.5 0 1 1-2-4.2M13.5 2.5V5H11"/>
        </svg>
        <span className="page-header-refresh-label">Обновить</span>
      </button>
    </div>
  )
}
