import { useState } from 'react'
import { supabase } from '../db/supabase'

const field = 'w-full px-4 py-3 bg-white/[.06] border border-white/10 rounded-xl text-base'

/** Sign in or create an account (email + password). */
export default function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'reset'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const signup = mode === 'signup'
  const reset = mode === 'reset'

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (reset) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin
        })
        if (error) throw error
        setInfo('If that email has an account, a reset link is on its way. Open it on this phone to set a new password.')
        setMode('signin')
      } else if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin }
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Check your email and tap the confirmation link, then sign in here.')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10 max-w-sm mx-auto w-full">
      <h1 className="text-3xl font-bold mb-1">{reset ? 'Reset password' : signup ? 'Create account' : 'Sign in'}</h1>
      <p className="text-secondary mb-8">
        {reset ? 'We\'ll email you a link to set a new one.' : signup ? 'Your workouts are private to your account.' : 'Welcome back.'}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {signup && (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
            autoComplete="name"
            required
            className={field}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          autoComplete="username"
          autoCapitalize="none"
          required
          className={field}
        />
        {!reset && <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={signup ? 'Password (at least 8 characters)' : 'Password'}
          aria-label="Password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          minLength={signup ? 8 : undefined}
          required
          className={field}
        />}
        {error && <p className="notice text-sm text-red-400">{error}</p>}
        {info && <p className="notice text-sm">{info}</p>}
        <button type="submit" disabled={busy} className="btn-accent w-full py-3 font-medium disabled:opacity-50">
          {busy ? '…' : reset ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {mode === 'signin' && (
        <button
          onClick={() => { setMode('reset'); setError(null); setInfo(null) }}
          className="mt-4 text-sm text-secondary hover:text-[color:var(--ink)]"
        >
          Forgot password?
        </button>
      )}

      <button
        onClick={() => { setMode(signup || reset ? 'signin' : 'signup'); setError(null); setInfo(null) }}
        className="mt-6 text-sm text-secondary hover:text-[color:var(--ink)]"
      >
        {reset ? 'Back to sign in' : signup ? 'Already have an account? Sign in' : 'New here? Create an account'}
      </button>
    </div>
  )
}

/** Shown after opening a password reset link: choose a new password. */
export function NewPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10 max-w-sm mx-auto w-full">
      <h1 className="text-3xl font-bold mb-1">New password</h1>
      <p className="text-secondary mb-8">Choose a new password for your account.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="New password (at least 8 characters)"
          aria-label="New password"
          autoComplete="new-password"
          minLength={8}
          required
          className={field}
        />
        {error && <p className="notice text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn-accent w-full py-3 font-medium disabled:opacity-50">
          {busy ? '…' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
