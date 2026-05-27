interface Props {
  lastUpdated: string
  pulse: boolean
  onRefresh: () => void
}

export default function LiveBadge({ lastUpdated, pulse, onRefresh }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-3)' }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--positive)',
          display: 'inline-block',
          animation: pulse ? 'none' : 'livepulse 1.6s infinite',
          opacity: pulse ? 1 : undefined,
        }} />
        <style>{`@keyframes livepulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
        <span className="mono">{lastUpdated ? `обновлено ${lastUpdated}` : 'Realtime'}</span>
      </div>
      <button
        onClick={onRefresh}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 30, padding: '0 11px', borderRadius: 7,
          border: '1px solid var(--line)', background: 'var(--bg-elev)',
          color: 'var(--ink)', font: 'inherit', fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
          <path d="M13.5 8a5.5 5.5 0 1 1-2-4.2M13.5 2.5V5H11"/>
        </svg>
        Обновить
      </button>
    </div>
  )
}
