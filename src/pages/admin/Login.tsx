import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'
import { useAdmin } from '../../lib/useAdmin'

export default function Login() {
  const { state } = useAdmin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (state === 'admin' || state === 'not-admin') return <Navigate to="/admin" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (!error) return
    if (error.message === 'Invalid login credentials') setError('E-mail ou mot de passe incorrect.')
    else if (error.message === 'Email not confirmed') setError("Adresse pas encore confirmée : cliquez sur le lien reçu par e-mail.")
    else setError(errorMessage(error))
  }

  async function forgot() {
    setError('')
    if (!email.trim()) return setError("Indiquez d'abord votre e-mail ci-dessus.")
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/mot-de-passe`,
    })
    if (error) setError(errorMessage(error))
    else setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de partir.')
  }

  return (
    <div className="page narrow">
      <h1>Espace formateur</h1>
      <form className="card stack" onSubmit={submit}>
        <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Mot de passe<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {error && <p className="error">{error}</p>}
        {info && <p className="success">{info}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <button type="button" className="link small" onClick={forgot}>Mot de passe oublié ?</button>
      </form>
      <p className="center small">Pas encore de compte ? <Link to="/admin/inscription">Créer mon compte formateur</Link></p>
    </div>
  )
}
