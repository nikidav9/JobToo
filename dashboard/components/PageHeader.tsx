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
      padding: '18px 24px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      borderBottom: '1px solid var(--line)',
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.018em', color: 'var(--ink)', margin: 0, textWrap: 'balance' }}>
          {title}
        </h1>
        <div className="page-header-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, flexWrap: 'wrap' }}>
          {/* «Обновляется» показываем, только когда страница правда сама
              обновляется. Раньше зелёная точка мигала везде, включая разделы,
              которые перечитываются лишь по кнопке, — и обещала живые данные
              там, где их не было. */}
          {intervalSec ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden="true" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--positive)', display: 'inline-block',
                animation: 'livepulse 1.6s var(--ease) infinite', flexShrink: 0,
              }} />
              <style>{`@keyframes livepulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
              Обновляется каждые {intervalSec}с
            </span>
          ) : null}
          {lastUpdated && <>
            <span aria-hidden="true" style={{ color: 'var(--ink-4)' }}>·</span>
            <span className="mono">{lastUpdated}</span>
          </>}
        </div>
      </div>

      <button
        onClick={onRefresh}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 34, padding: '0 12px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
          border: '1px solid var(--line)', background: 'var(--bg-elev)',
          color: 'var(--ink-2)', font: 'inherit', fontSize: 13, fontWeight: 500,
          cursor: 'pointer',
          transition: 'border-color var(--fast) var(--ease), color var(--fast) var(--ease)',
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
