'use client'
export default function QualityError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>Ошибка на странице Качество</div>
      <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace', maxWidth: 480, textAlign: 'center', background: '#f5f5f5', padding: '12px 16px', borderRadius: 8 }}>
        {error.message || 'Неизвестная ошибка'}
      </div>
      {error.digest && (
        <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>digest: {error.digest}</div>
      )}
      <button onClick={reset} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 13, cursor: 'pointer' }}>
        Повторить
      </button>
    </div>
  )
}
