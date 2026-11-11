import { useState } from 'react'
import { api } from '../api.js'

const DEMOS = [
  { name: 'Gauri', email: 'gauri@memoflow.app' },
  { name: 'Alex', email: 'alex@memoflow.app' },
]

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const json = mode === 'login' ? { email, password } : { name, email, password }
      const data = await api(path, { method: 'POST', json })
      onAuth(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function enterDemo(demoEmail) {
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        json: { email: demoEmail, password: 'memoflow' },
      })
      onAuth(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-sidebar px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(61,116,192,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(44,65,88,0.18),transparent_35%)]" />
      <div className="relative w-full max-w-md">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-link">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm text-white shadow-lg shadow-blue-950/30">M</span>
          MemoFlow
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Notes for you, and for the team.</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Capture a thought, keep it personal, or share it with a workspace.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-line bg-card/95 p-5 shadow-2xl shadow-black/25 backdrop-blur">
          {mode === 'register' && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Name</span>
              <input name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={40} autoComplete="name" className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 outline-none focus:border-accent" />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input name="email" autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 outline-none focus:border-accent" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 outline-none focus:border-accent" />
          </label>
          {error && <p className="rounded-lg border border-[#704044] bg-[#3a2428] px-3 py-2 text-sm text-[#f0b4b4]" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            className="w-full text-sm text-muted hover:text-soft"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
              setPassword('')
            }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </form>
        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-muted">Demo workspace</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {DEMOS.map((demo) => (
              <button key={demo.email} type="button" disabled={busy} onClick={() => enterDemo(demo.email)} className="rounded-xl border border-line bg-card px-3 py-3 text-left hover:border-[#4a5563] disabled:opacity-60">
                <span className="block text-sm font-medium">{demo.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{demo.email}</span>
                <span className="mt-1 block text-xs text-tagtext">Password memoflow</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
