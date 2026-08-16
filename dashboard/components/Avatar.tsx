/**
 * Кружок с инициалами.
 *
 * Цвет раньше был вписан прямо в градиент — `linear-gradient(135deg,#C8501E,#7D2D0E)`
 * для работника и синий для работодателя. Оттенки остались от старой палитры,
 * так что на странице соседствовали два разных «оранжевых JobToo».
 *
 * Градиент сохранён — он единственное место в панели, где цвет плотный, и
 * кружок за счёт этого читается как якорь строки. Но строится он теперь из
 * акцента: тёмный край — тот же цвет, притемнённый наложением.
 */

export default function Avatar({ name, phone, role, size = 32 }: {
  name?: string | null
  phone?: string | null
  role: string
  size?: number
}) {
  const base = role === 'worker' ? 'var(--accent)' : 'var(--info)'
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        backgroundImage: `linear-gradient(135deg, ${base}, rgba(0,0,0,.34)), linear-gradient(${base}, ${base})`,
        display: 'grid', placeItems: 'center',
        color: '#fff', fontWeight: 600, fontSize: Math.round(size * 0.34),
        letterSpacing: '.02em',
      }}
    >
      {initials(name ?? '', phone ?? '')}
    </div>
  )
}

export function initials(name: string, phone: string) {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return phone.slice(-2)
}
