import type { Metadata, Viewport } from 'next'
import './globals.css'
import Shell from '@/components/Shell'
import SwRegister from '@/components/SwRegister'

export const metadata: Metadata = {
  title: 'JobToo — Аналитика',
  description: 'Аналитический дашборд JobToo',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'JobToo',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icon-192.svg',
    apple: '/icon-192.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#16140F',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Shell>{children}</Shell>
        <SwRegister />
      </body>
    </html>
  )
}
