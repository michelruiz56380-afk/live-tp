import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'
import { useAdmin } from '../../lib/useAdmin'

export default function Login() {
  const { state } = useAdmin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (state === 'admin' || state === 'not-admin') return <Navigate to="/admin" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'E-mail ou mot de passe incorrect.' : errorMessage(error))
  }

  return (
    <div className="page narrow">
      <h1>Espace formateur</h1>
      <form className="card stack" onSubmit={submit}>
        <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Mot de passe<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  )
}
