import type { ComponentType } from 'react'

/**
 * Разделы панели — одним списком.
 *
 * До этого их было два: свой в боковом меню и свой в нижнем, для телефона.
 * Списки разошлись молча — новые разделы («Ни разу не заходили», «Ключи API»)
 * появились в одном и не появились в другом, и с телефона их просто не
 * существовало. Заметить такое можно только случайно.
 *
 * Теперь список один. Добавили строку — раздел появился везде.
 */
export type NavItem = {
  href: string
  label: string
  /** Короткая подпись для нижнего меню на телефоне, где места мало. */
  short?: string
  icon: string
}

export const NAV: NavItem[] = [
  { href: '/',            label: 'Обзор',                short: 'Обзор',    icon: 'grid' },
  { href: '/summary',     label: 'Сводка',                                  icon: 'summary' },
  { href: '/users',       label: 'Пользователи',         short: 'Люди',     icon: 'users' },
  { href: '/last-seen',   label: 'Последний вход',       short: 'Входы',    icon: 'clock' },
  { href: '/dormant',     label: 'Ни разу не заходили',  short: 'Спящие',   icon: 'clock' },
  { href: '/vacancies',   label: 'Вакансии',                                icon: 'jobs' },
  { href: '/outreach',    label: 'Обзвон',                                  icon: 'phone' },
  { href: '/support',     label: 'Поддержка',                               icon: 'ticket' },
  { href: '/bot-inbox',   label: 'Бот',                                     icon: 'chat' },
  { href: '/matching',    label: 'Совпадения',           short: 'Матчи',    icon: 'match' },
  { href: '/engagement',  label: 'Активность',                              icon: 'pulse' },
  { href: '/quality',     label: 'Качество',                                icon: 'star' },
  { href: '/chats',       label: 'Переписки',            short: 'Чаты',     icon: 'chat' },
  { href: '/reviews',     label: 'Отзывы',                                  icon: 'review' },
  { href: '/moderation',  label: 'Модерация',                               icon: 'shield' },
  { href: '/tickets',     label: 'Тикеты',                                  icon: 'ticket' },
  { href: '/broadcast',   label: 'Рассылка',                                icon: 'bell' },
  { href: '/api-keys',    label: 'Ключи API',            short: 'API',      icon: 'shield' },
  { href: '/funnel',      label: 'Воронка',                                 icon: 'funnel' },
  { href: '/cohorts',     label: 'Когорты',                                 icon: 'cohort' },
  { href: '/geo',         label: 'Гео',                                     icon: 'geo' },
  { href: '/activity',    label: 'Лог действий',         short: 'Лог',      icon: 'pulse' },
]

/** Название раздела по адресу — для заголовка страницы. */
export function labelFor(path: string): string {
  const p = path.replace(/\/$/, '') || '/'
  return NAV.find(n => n.href === p)?.label ?? p
}
