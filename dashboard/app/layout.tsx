import type { Metadata, Viewport } from 'next'
import './globals.css'
import Shell from '@/components/Shell'
import SwRegister from '@/components/SwRegister'

export const metadata: Metadata = {
  title: 'JobMatch — Аналитика',
  description: 'Аналитический дашборд JobMatch',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'JobMatch',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#16140F',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <Shell>{children}</Shell>
        <SwRegister />
      </body>
    </html>
  )
}
