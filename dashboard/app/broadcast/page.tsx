'use client'
import { useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { broadcastPush, sendPushToUser } from '@/lib/admin-actions'
import { supabaseAdmin } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

type Target = 'all' | 'workers' | 'employers' | 'metro' | 'user'
type St = 'idle' | 'loading' | 'ok' | 'err'

const TARGETS: { value: Target; label: string; desc: string }[] = [
  { value: 'all',       label: '👥 Все пользователи',  desc: 'Работники + работодатели с push-токеном' },
  { value: 'workers',   label: '👷 Работники',          desc: 'Только работники' },
  { value: 'employers', label: '🏢 Работодатели',       desc: 'Только работодатели' },
  { value: 'metro',     label: '🚇 По метро',           desc: 'Пользователи конкретной станции' },
  { value: 'user',      label: '👤 Конкретный человек', desc: 'По номеру телефона' },
]

interface Trigger {
  id: string
  label: string
  desc: string
  target: 'all' | 'workers' | 'employers' | 'metro'
  title: string
  body: string
}

const TRIGGERS: Trigger[] = [
  {
    id: 'inactive_workers',
    label: '😴 Неактивные работники',
    desc: 'Работники без активности 30+ дней — напомнить о себе',
    target: 'workers',
    title: '👋 Новые подработки рядом!',
    body: 'Давно не заходили? Посмотрите свежие вакансии в вашем районе — уже сегодня!',
  },
  {
    id: 'new_week',
    label: '🎉 Новые пользователи недели',
    desc: 'Приветственный пуш новым пользователям',
    target: 'all',
    title: '🎉 Добро пожаловать в JobToo!',
    body: 'Мы рады вас видеть. Заполните профиль и находите работу ещё быстрее.',
  },
  {
    id: 'reactivate_employers',
    label: '📋 Реактивация работодателей',
    desc: 'Работодатели без новых вакансий 14+ дней',
    target: 'employers',
    title: '🔔 Нужны сотрудники?',
    body: 'Разместите вакансию за 2 минуты — наши работники уже ищут подработку рядом с вами.',
  },
  {
    id: 'push_workers_match',
    label: '💚 Мотивация для работников',
    desc: 'Работники с 0 совпадений — помочь активироваться',
    target: 'workers',
    title: '💡 Совет: повысьте шансы!',
    body: 'Добавьте фото профиля и укажите станцию метро — работодатели охотнее выбирают заполненные анкеты.',
  },
  {
    id: 'week_summary',
    label: '📊 Еженедельный дайджест',
    desc: 'Сводка активности за неделю — всем пользователям',
    target: 'all',
    title: '📊 Итоги недели в JobToo',
    body: 'Новые вакансии, новые работники. Загляните — возможно, ваш идеальный вариант уже ждёт!',
  },
]

export default function BroadcastPage() {
  const [target, setTarget] = useState<Target>('workers')
  const [metro, setMetro] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [st, setSt] = useState<St>('idle')
  const [result, setResult] = useState('')
  const [triggerSt, setTriggerSt] = useState<Record<string, St>>({})

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
        logActivity('Пуш отправлен', `Адресат: ${phone}`, data.id)
        setSt('ok'); setResult('✓ Пуш отправлен пользователю')
      } else {
        const count = await broadcastPush(target, title, body, metro || undefined)
        logActivity('Рассылка', `Цель: ${target}, заголовок: "${title}", получателей: ${count}`)
        setSt('ok'); setResult(`✓ Отправлено ${count} пользователям`)
      }
    } catch (e: any) {
      setSt('err'); setResult('✗ ' + e.message)
    }
    setTimeout(() => setSt('idle'), 4000)
  }

  async function handleTrigger(t: Trigger) {
    setTriggerSt(prev => ({ ...prev, [t.id]: 'loading' }))
    try {
      const count = await broadcastPush(t.target, t.title, t.body)
      logActivity('Рассылка (авто)', `Триггер: "${t.label}", получателей: ${count}`)
      setTriggerSt(prev => ({ ...prev, [t.id]: 'ok' }))
      setTimeout(() => setTriggerSt(prev => ({ ...prev, [t.id]: 'idle' })), 3000)
    } catch (e: any) {
      setTriggerSt(prev => ({ ...prev, [t.id]: 'err' }))
      setTimeout(() => setTriggerSt(prev => ({ ...prev, [t.id]: 'idle' })), 3000)
    }
  }

  function applyTemplate(t: Trigger) {
    setTarget(t.target)
    setTitle(t.title)
    setBody(t.body)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
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
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Left column */}
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280 }}>

            {/* Trigger templates */}
            <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 12 }}>
                ⚡ Быстрые шаблоны
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TRIGGERS.map(t => {
                  const tst = triggerSt[t.id] ?? 'idle'
                  return (
                    <div key={t.id} style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: 'var(--bg-sunken)', border: '1px solid var(--line)',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{t.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 2 }}>{t.desc}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, fontStyle: 'italic' }}>
                          → {TARGETS.find(x => x.value === t.target)?.label.replace(/[^\w\s]/g, '').trim()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => handleTrigger(t)}
                          disabled={tst === 'loading'}
                          style={{
                            height: 28, padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 500,
                            background: tst === 'ok' ? 'var(--positive)' : tst === 'err' ? 'var(--negative)' : 'var(--ink)',
                            color: '#fff', whiteSpace: 'nowrap',
                          }}
                        >
                          {tst === 'loading' ? '…' : tst === 'ok' ? '✓' : tst === 'err' ? '✗' : '🚀 Отправить'}
                        </button>
                        <button
                          onClick={() => applyTemplate(t)}
                          style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 11.5, background: 'var(--bg-elev)', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}
                        >
                          ✏️ Изменить
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right column — manual composer */}
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 280 }}>

            {/* Target selector */}
            <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--shadow-sm)' }}>
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
                    background: result.startsWith('✓') ? 'rgba(46,125,84,.08)' : 'rgba(179,60,42,.08)',
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
    </div>
  )
}
