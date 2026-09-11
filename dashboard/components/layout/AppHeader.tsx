'use client'

/**
 * Шапка панели: кнопка меню, название раздела, переключатель темы и выход.
 *
 * Про тему. Прежняя система темы не имела вовсе — панель была только светлой,
 * и это было решением: с ней работают днём с одного рабочего места. TailAdmin
 * приносит обе, поэтому светлая осталась значением по умолчанию, а тёмная —
 * выбором того, кто смотрит. Выбор запоминается в браузере.
 */

import { usePathname } from 'next/navigation'
import { useSidebar } from '@/context/SidebarContext'
import { useTheme } from '@/context/ThemeContext'
import { labelFor } from '@/lib/nav'
import { clearAuth } from '../AuthGuard'

export default function AppHeader() {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar()
  const { theme, toggleTheme } = useTheme()
  const path = usePathname()

  return (
    <header className="sticky top-0 z-40 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Меню"
            onClick={() => {
              // На узком экране меню выезжает поверх страницы, на широком —
              // сворачивается до значков. Кнопка одна, поведение разное.
              if (window.innerWidth < 1024) toggleMobileSidebar()
              else toggleSidebar()
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {isMobileOpen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>

          <h1 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
            {labelFor(path)}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => { clearAuth(); window.location.replace('/login/') }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-theme-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Выйти
          </button>
        </div>
      </div>
    </header>
  )
}
