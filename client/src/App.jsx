import { useEffect, useState } from 'react'
import { api } from './api.js'
import AuthScreen from './components/AuthScreen.jsx'
import Shell from './components/Shell.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Remove legacy bearer tokens now that sessions are cookie-only.
    localStorage.removeItem('memoflow_token')
    let ignore = false
    api('/api/auth/me', { skipAuthRedirect: true }).then((data) => {
      if (!ignore) setUser(data.user)
    }).catch(() => {}).finally(() => {
      if (!ignore) setReady(true)
    })
    return () => { ignore = true }
  }, [])

  if (!ready) {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading MemoFlow…</div>
  }

  if (!user) return <AuthScreen onAuth={setUser} />
  return <Shell user={user} onLogout={() => setUser(null)} />
}
