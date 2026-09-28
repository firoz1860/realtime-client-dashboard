'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'

export type AuthMode = 'login' | 'signup'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthDialog({ mode, onModeChange, onClose, onGuest }: { mode: AuthMode; onModeChange: (m: AuthMode) => void; onClose: () => void; onGuest: () => void }) {
  const { login, register, signupEnabled } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstField = useRef<HTMLInputElement | null>(null)
  const isSignup = mode === 'signup' && signupEnabled

  useEffect(() => { setError(null); firstField.current?.focus() }, [mode])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [busy, onClose])

  const validate = (): string | null => {
    if (isSignup && name.trim().length < 2) return 'Enter your full name (at least 2 characters).'
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (isSignup) {
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must include at least one letter and one number.'
      if (password !== confirm) return 'Passwords do not match.'
    }
    return null
  }

  const submit = async () => {
    const problem = validate()
    if (problem) { setError(problem); return }
    setBusy(true)
    setError(null)
    try {
      if (isSignup) await register({ name: name.trim(), email: email.trim(), password })
      else await login(email.trim(), password)
      // The page switches to the workspace once the session is authenticated.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  const strength = (() => {
    let score = 0
    if (password.length >= 8) score += 1
    if (password.length >= 12) score += 1
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
    if (/[0-9]/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    return Math.min(score, 4)
  })()

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="icon-btn dialog-close" onClick={onClose} aria-label="Close" disabled={busy}><X size={18} /></button>
        <h2 id="auth-title">{isSignup ? 'Create your Orbit account' : 'Log in to Orbit'}</h2>
        <p className="dialog-sub">{isSignup ? 'It takes less than a minute. Your admin can change your role later.' : 'Welcome back. Pick up where your team left off.'}</p>

        {signupEnabled && (
          <div className="segmented" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? 'is-active' : ''} onClick={() => onModeChange('login')}>Log in</button>
            <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'is-active' : ''} onClick={() => onModeChange('signup')}>Create account</button>
          </div>
        )}

        <form className="form" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
          {isSignup && (
            <label className="field">Full name
              <input ref={firstField} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} placeholder="Priya Shah" />
            </label>
          )}
          <label className="field">Work email
            <input ref={isSignup ? undefined : firstField} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={isSignup ? 'email' : 'username'} placeholder="you@company.com" />
          </label>
          <label className="field">Password
            <span className="input-affix">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} maxLength={128} placeholder={isSignup ? 'At least 8 characters, with a number' : 'Your password'} />
              <button type="button" className="icon-btn" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
          {isSignup && password && (
            <div className="strength" aria-label={`Password strength ${['very weak', 'weak', 'fair', 'good', 'strong'][strength]}`}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < strength ? `on s${strength}` : ''} />)}
              <span>{['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][strength]}</span>
            </div>
          )}
          {isSignup && (
            <label className="field">Confirm password
              <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={128} />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? (isSignup ? 'Creating account…' : 'Logging in…') : (isSignup ? 'Create account' : 'Log in')}
          </button>
        </form>

        <div className="dialog-foot">
          {signupEnabled
            ? isSignup
              ? <span>Already have an account? <button type="button" className="link" onClick={() => onModeChange('login')}>Log in</button></span>
              : <span>New to Orbit? <button type="button" className="link" onClick={() => onModeChange('signup')}>Create an account</button></span>
            : <span>Need an account? Ask your workspace admin.</span>}
          <button type="button" className="link link-muted" onClick={onGuest}>Preview without an account</button>
        </div>
        {process.env.NODE_ENV === 'development' && !isSignup && <p className="dev-hint">Local demo accounts are listed in RUN.md.</p>}
      </section>
    </div>
  )
}
