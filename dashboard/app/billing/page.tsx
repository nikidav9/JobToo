import PageHeader from '@/components/PageHeader'

function IconLock() {
  return <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
}

/**
 * Финансовый раздел намеренно закрыт до выбора тарифа, оформления ИП/ООО
 * и запуска реальных расчётов. Ссылка остаётся видимой в меню как будущая
 * возможность, но не открывается и не загружает финансовые данные.
 */
export default function BillingPage() {
  return (
    <div>
      <PageHeader title="К счёту" />
      <div className="page-content" style={{ maxWidth: 760 }}>
        <div className="jt-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18,
            display: 'grid', placeItems: 'center',
            color: 'var(--ink-2)', background: 'var(--bg-sunken)', border: '1px solid var(--line)',
          }}>
            <IconLock />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--ink)' }}>Раздел пока закрыт</h2>
          <p style={{ margin: '8px auto 0', maxWidth: '52ch', color: 'var(--ink-3)', fontSize: 14 }}>
            Он станет доступен после утверждения модели оплаты и запуска расчётов с партнёрами.
          </p>
        </div>
      </div>
    </div>
  )
}
