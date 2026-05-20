'use client'
import { useEffect } from 'react'

export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const base = document.querySelector('base')?.href.replace(location.origin, '') || ''
      navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' }).catch(() => {})
    }
  }, [])
  return null
}
