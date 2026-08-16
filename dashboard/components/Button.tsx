'use client'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Кнопка.
 *
 * В панели их около двухсот, и до этого каждая описывала себя сама: высота
 * 28, 30, 32, 34 и 38; скругления 6, 7, 8 и 12; выключенное состояние то
 * прозрачностью 0.5, то 0.4, то никак. На одном экране это заметно сразу.
 *
 * Видов ровно три, и они отвечают на разные вопросы:
 *   primary   — главное действие экрана, оно одно;
 *   secondary — всё остальное;
 *   danger    — то, что нельзя отменить.
 *
 * Опасное отдельным видом, а не «красным текстом на обычной кнопке»: удаление
 * и рассылка на триста человек должны выглядеть иначе, чем «обновить».
 */

type Variant = 'primary' | 'secondary' | 'danger'

export default function Button({
  variant = 'secondary', icon, children, style, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  icon?: ReactNode
}) {
  return (
    <button
      {...rest}
      className={`jt-btn jt-btn-${variant}${rest.className ? ' ' + rest.className : ''}`}
      style={style}
    >
      {icon}
      {children}
    </button>
  )
}
