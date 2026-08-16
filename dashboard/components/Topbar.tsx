'use client'
import { usePathname } from 'next/navigation'
import { labelFor } from '@/lib/nav'

/**
 * Полоса над содержимым: где вы находитесь.
 *
 * Отсюда убрано поле поиска. Оно выглядело рабочим — рамка, значок, подсказка
 * «⌘K» — и не делало ничего: ни обработчика, ни сочетания клавиш. Элемент,
 * который обещает и не выполняет, хуже отсутствующего: человек пробует его
 * раз, другой, и перестаёт доверять остальному.
 *
 * Названия разделов берутся из общего списка, а не из своей копии: прежняя
 * копия отставала, и на новых разделах в заголовке показывался голый адрес
 * вроде «/api-keys».
 */
export default function Topbar() {
  const label = labelFor(usePathname())
  return (
    <header className="topbar" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 24px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg)',
      position: 'sticky', top: 0, zIndex: 20,
      fontSize: 13, color: 'var(--ink-3)',
    }}>
      <span>JobToo</span>
      <span aria-hidden="true" style={{ color: 'var(--ink-4)' }}>/</span>
      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{label}</span>
    </header>
  )
}
