'use client'
import { useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { broadcastPush, sendPushToUser } from '@/lib/admin-actions'
import { supabaseAdmin } from '@/lib/supabase'

type Target = 'all' | 'workers' | 'employers' | 'metro' | 'user'
type St = 'idle' | 'loading' | 'ok' | 'err'

const TARGETS: { value: Target; label: string; desc: string }[] = [
  { value: 'all',       label: '👥 Все пользователи',  desc: 'Работники + работодатели с push-токеном' },
  { value: 'workers',   label: '👷 Работники',          desc: 'Только работники' },
  { value: 'employers', label: '🏢 Работодатели',       desc: 'Только работодатели' },
  { value: 'metro',     label: '🚇 По метро',           desc: 'Пользователи конкретной станции' },
  { value: 'user',      label: '👤 Конкретный человек', desc: 'По номеру телефона' },
]

export default function BroadcastPage() {
  const [target, setTarget] = useState<Target>('workers')
  const [metro, setMetro] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [st, setSt] = useState<St>('idle')
  const [result, setResult] = useState('')

  async function handleSend() {
    if (!title.trim() || !body.trim()) return
    setSt('loading')
    setResult('')
    try {
      if (target === 'user') {
        const digits = phone.replace(/\D/g, '')
        const { data } = await supabaseAdmin.from('jm_users').select('id').eq('phone', digits).maybeSingle()
        if (!data) throw new Error('Пользователь с таким телефоном не найден')
        await sendPushToUser(data.id, title, body)
        setSt('ok'); setResult('✓ Пуш отправлен пользователю')
      } else {
        const count = await broadcastPush(target, title, body, metro || undefined)
        setSt('ok'); setResult(`✓ Отправлено ${count} пользователям`)
      }
    } catch (e: any) {
      setSt('err'); setResult('✗ ' + e.message)
    }
    setTimeout(() => setSt('idle'), 4000)
  }

  const inp = (label: string, value: string, onChange: (v: string) => void, placeholder?: string, area?: boolean) => (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>{label}</label>
      {area
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', height: 36, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-sunken)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      }
    </div>
  )

  return (
    <div>
      <PageHeader title="Рассылка пушей" />
      <div className="page-content">
        <div style={{ maxWidth: 560 }}>

          {/* Target selector */}
          <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)', marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 12 }}>
              Кому отправить
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TARGETS.map(t => (
                <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: target === t.value ? 'var(--accent-soft)' : 'var(--bg-sunken)', border: `1px solid ${target === t.value ? 'var(--accent-line)' : 'transparent'}`, transition: 'all .1s' }}>
                  <input type="radio" name="target" value={t.value} checked={target === t.value} onChange={() => setTarget(t.value)} style={{ accentColor: 'var(--accent)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{t.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {target === 'metro' && (
              <div style={{ marginTop: 10 }}>
                {inp('Станция метро', metro, setMetro, 'Напр.: Тульская')}
              </div>
            )}
            {target === 'user' && (
              <div style={{ marginTop: 10 }}>
                {inp('Номер телефона', phone, setPhone, '+7 999 123 45 67')}
              </div>
            )}
          </div>

          {/* Message composer */}
          <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 14 }}>
              Сообщение
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {inp('Заголовок', title, setTitle, 'Напр.: 🎉 Новые вакансии рядом!')}
              {inp('Текст', body, setBody, 'Напр.: Посмотри свежие подработки в твоём районе', true)}

              {/* Preview */}
              {(title || body) && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-sunken)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 6 }}>Предпросмотр уведомления</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--ink)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>J</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{title || '—'}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{body || '—'}</div>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={!title.trim() || !body.trim() || st === 'loading'}
                style={{
                  height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: st === 'ok' ? 'var(--positive)' : st === 'err' ? 'var(--negative)' : 'var(--ink)',
                  color: '#fff', fontSize: 13.5, fontWeight: 500,
                  opacity: (!title.trim() || !body.trim()) ? 0.45 : 1,
                  transition: 'background .15s, opacity .15s',
                }}
              >
                {st === 'loading' ? 'Отправка…' : '🚀 Отправить'}
              </button>

              {result && (
                <div style={{
                  padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: st === 'ok' || result.startsWith('✓') ? 'rgba(46,125,84,.08)' : 'rgba(179,60,42,.08)',
                  color: result.startsWith('✓') ? 'var(--positive)' : 'var(--negative)',
                  border: `1px solid ${result.startsWith('✓') ? 'rgba(46,125,84,.2)' : 'rgba(179,60,42,.2)'}`,
                }}>
                  {result}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
