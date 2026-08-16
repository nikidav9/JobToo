'use client'
import { useState, useEffect } from 'react'
import { login as doLogin, isAuthed } from '@/components/AuthGuard'

function getBasePath() {
  if (typeof window === 'undefined') return ''
  return window.location.pathname.includes('/JobToo') ? '/JobToo' : ''
}

export default function LoginPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthed()) window.location.replace(getBasePath() + '/')
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Логин и пароль проверяет прокси и в ответ выдаёт токен — тот самый,
      // без которого база теперь ничего не отдаёт.
      await doLogin(login, password)
      window.location.replace(getBasePath() + '/')
    } catch (e: any) {
      setError(e?.message || 'Ошибка соединения. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 360,
        background: 'var(--bg-elev)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-md)',
        padding: '36px 32px 32px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'var(--ink)', color: 'var(--bg)',
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em',
          }}>J</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.01em' }}>JobToo</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Аналитика · Admin</div>
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 6px' }}>
          Вход
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 24px' }}>
          Доступ только для администраторов
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>
              Логин
            </label>
            <input
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="логин"
              autoComplete="username"
              style={{
                width: '100%', height: 36, padding: '0 12px',
                border: `1px solid ${error ? 'var(--negative)' : 'var(--line)'}`,
                borderRadius: 8, background: 'var(--bg-elev)',
                color: 'var(--ink)', font: 'inherit', fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color .12s',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = 'var(--ink-3)' }}
              onBlur={e => { e.target.style.borderColor = error ? 'var(--negative)' : 'var(--line)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="пароль"
              autoComplete="current-password"
              style={{
                width: '100%', height: 36, padding: '0 12px',
                border: `1px solid ${error ? 'var(--negative)' : 'var(--line)'}`,
                borderRadius: 8, background: 'var(--bg-elev)',
                color: 'var(--ink)', font: 'inherit', fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color .12s',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = 'var(--ink-3)' }}
              onBlur={e => { e.target.style.borderColor = error ? 'var(--negative)' : 'var(--line)' }}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: 'var(--negative-soft)', border: '1px solid var(--negative-line)',
              color: 'var(--negative)', fontSize: 12.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !login || !password}
            style={{
              height: 38, borderRadius: 8, border: '1px solid var(--ink)',
              background: loading ? 'var(--ink-2)' : 'var(--ink)',
              color: 'var(--bg)', font: 'inherit', fontSize: 13.5, fontWeight: 500,
              cursor: loading ? 'default' : 'pointer',
              opacity: !login || !password ? 0.5 : 1,
              marginTop: 4, transition: 'opacity .12s, background .12s',
            }}
          >
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>

        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 20 }}>
          JobToo Analytics · только Admin
        </p>
      </div>
    </div>
  )
}
