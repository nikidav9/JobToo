export function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) return
  const keys = Object.keys(rows[0])
  const header = keys.join(',')
  const body = rows.map(r =>
    keys.map(k => {
      const v = r[k] ?? ''
      const s = String(v).replace(/"/g, '""')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
