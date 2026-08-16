'use client'

/**
 * Ряд фильтров со счётчиками.
 *
 * Такой ряд есть в шести разделах, и до этого каждый рисовал его сам: где
 * скругление 100, где 8; где счётчик просто с `opacity: .7` — то есть на
 * выбранном фильтре он белел до нечитаемости.
 *
 * Счётчик здесь всегда обязателен и всегда виден: фильтр без числа заставляет
 * нажимать наугад, чтобы узнать, есть ли там что-нибудь.
 */

export type ChipOption<T extends string> = {
  key: T
  label: string
  count: number
}

export default function FilterChips<T extends string>({
  options, value, onChange,
}: {
  options: ChipOption<T>[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
      {options.map(o => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className="jt-filter"
            data-on={on ? '1' : undefined}
            // Пустой срез приглушён, но нажимаем: он сообщает «здесь пусто»,
            // и это тоже ответ.
            style={o.count === 0 && !on ? { opacity: .55 } : undefined}
          >
            {o.label}
            <span className="num jt-filter-count">{o.count}</span>
          </button>
        )
      })}
    </div>
  )
}
