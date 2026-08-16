import type { SVGProps } from 'react'

/**
 * Иконки панели.
 *
 * До этого их роль исполняли эмодзи: 🚫 у заблокированного, 🏢 у компании,
 * 📲 и 📱 у каналов доставки — и 😇 у станции метро, что не значило ровно
 * ничего. Эмодзи рисует шрифт устройства: на Windows один набор, на маке
 * другой, в Android третий; размер, вес и цвет ими не управляются. Отсюда
 * правило в MASTER.md — иконки только SVG.
 *
 * Все иконки рисуются в квадрате 24 и наследуют цвет текста, поэтому в
 * разметке им хватает размера.
 */

type Props = SVGProps<SVGSVGElement> & { size?: number }

function Ico({ size = 14, children, ...rest }: Props) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ flexShrink: 0, ...(rest.style ?? {}) }}
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Заблокирован. */
export const IconBan = (p: Props) => (
  <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></Ico>
)

/** Метро — точка на линии. */
export const IconMetro = (p: Props) => (
  <Ico {...p}><circle cx="12" cy="12" r="4" /><path d="M3 12h5M16 12h5" /></Ico>
)

/** Компания. */
export const IconBuilding = (p: Props) => (
  <Ico {...p}>
    <path d="M4 21V6a1 1 0 011-1h8a1 1 0 011 1v15" />
    <path d="M14 10h5a1 1 0 011 1v10" /><path d="M3 21h18" />
    <path d="M7.5 9h3M7.5 13h3M7.5 17h3M17 14h.01M17 17h.01" />
  </Ico>
)

/** Приложение с пушами (Expo, Android). */
export const IconApp = (p: Props) => (
  <Ico {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" />
  </Ico>
)

/** Веб-пуш на iPhone. */
export const IconBell = (p: Props) => (
  <Ico {...p}>
    <path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.5 20a1.9 1.9 0 003 0" />
  </Ico>
)

/** Профиль. */
export const IconUser = (p: Props) => (
  <Ico {...p}>
    <circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0115 0" />
  </Ico>
)

/** Удалить. */
export const IconTrash = (p: Props) => (
  <Ico {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
    <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
  </Ico>
)

/** Сброс пароля. */
export const IconKey = (p: Props) => (
  <Ico {...p}>
    <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l2 2M14 9l2 2" />
  </Ico>
)

/** Смена роли. */
export const IconSwap = (p: Props) => (
  <Ico {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Ico>
)

/** Проверено. */
export const IconCheck = (p: Props) => <Ico {...p}><path d="M4.5 12.5l5 5 10-11" /></Ico>

/** Отказ, ошибка. */
export const IconX = (p: Props) => <Ico {...p}><path d="M6 6l12 12M18 6L6 18" /></Ico>

/** Раскрыть / свернуть. Поворачивается вместо подмены символа. */
export const IconChevron = ({ open, ...p }: Props & { open?: boolean }) => (
  <Ico {...p} style={{
    transform: open ? 'rotate(180deg)' : 'none',
    transition: 'transform var(--fast) var(--ease)',
    ...(p.style ?? {}),
  }}>
    <path d="M6 9.5l6 6 6-6" />
  </Ico>
)

/** Телефон. */
export const IconPhone = (p: Props) => (
  <Ico {...p}>
    <path d="M4.5 5.5a1.5 1.5 0 011.5-1.5h2.2a1 1 0 011 .8l.7 3a1 1 0 01-.3 1L8 10.5a12 12 0 005.5 5.5l1.7-1.6a1 1 0 011-.3l3 .7a1 1 0 01.8 1V18a1.5 1.5 0 01-1.5 1.5A14.5 14.5 0 014.5 5.5z" />
  </Ico>
)

/** Сообщение. */
export const IconSend = (p: Props) => (
  <Ico {...p}><path d="M21 3L10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3z" /></Ico>
)

/** Звезда рейтинга. Заливается, а не обводится. */
export const IconStar = ({ size = 14, filled = true, ...rest }: Props & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6"
    strokeLinejoin="round" aria-hidden="true" focusable="false"
    style={{ flexShrink: 0, ...(rest.style ?? {}) }} {...rest}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </svg>
)
