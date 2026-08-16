/**
 * Заглушка на время загрузки.
 *
 * Была своя в каждом из десяти разделов: где четыре полосы, где три, где
 * пять, высоты 64, 72, 88, 120 и 140. Ни одна не пульсировала, хотя стиль для
 * этого в панели есть, — и ни одна не совпадала по высоте с тем, что потом
 * появлялось на её месте, отчего страница на секунду прыгала.
 *
 * Здесь высоты те же, что у настоящих карточек: ряд чисел 118, график 300.
 * Место занято заранее — по MASTER.md это обязательное правило, а не забота
 * о красоте.
 */

export default function PageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="page-content" aria-busy="true" aria-label="Загрузка">
      <div className="g-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="jt-skeleton" style={{ height: 118 }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="jt-skeleton" style={{ height: 300 }} />
      ))}
    </div>
  )
}
