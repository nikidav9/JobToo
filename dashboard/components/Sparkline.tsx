'use client'
import { useRef, useState, useLayoutEffect } from 'react'

interface Props {
  data: number[]
  color?: string
  height?: number
}

export default function Sparkline({ data, color = 'var(--accent)', height = 36 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(120)

  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const h = height
  const n = data.length
  if (n < 2) return null

  const max = Math.max(1, ...data)
  const stepX = w / (n - 1)
  const pts = data.map((v, i) => [i * stepX, h - 2 - (v / max) * (h - 6)] as [number, number])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <div ref={ref} style={{ width: '100%', height: h }}>
      <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
        <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity={0.1} />
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
      </svg>
    </div>
  )
}
