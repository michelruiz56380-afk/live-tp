import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'
import { useAdmin } from '../../lib/useAdmin'

export default function Signup() {
  const { state } = useAdmin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (state === 'admin' || state === 'not-admin') return <Navigate to="/admin" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 10) return setError('Le mot de passe doit faire au moins 10 caractères.')
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    if (!data.session) setSent(true)
  }

  if (sent)
    return (
      <div className="page narrow">
        <h1>Vérifiez vos e-mails</h1>
        <div className="card stack">
          <p>Un lien de confirmation vient d'être envoyé à <strong>{email}</strong>. Cliquez dessus, puis connectez-vous.</p>
          <p className="muted small">Seules les adresses autorisées deviennent formateur. Les autres comptes n'ont accès à rien.</p>
          <Link className="btn" to="/admin/connexion">Aller à la connexion</Link>
        </div>
      </div>
    )

  return (
    <div className="page narrow">
      <h1>Créer mon compte formateur</h1>
      <form className="card stack" onSubmit={submit}>
        <p className="muted small">Réservé aux adresses autorisées par un formateur.</p>
        <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Mot de passe (10 caractères minimum)<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label>
        <label>Confirmer le mot de passe<input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Création…' : 'Créer mon compte'}</button>
      </form>
      <p className="center small">Déjà un compte ? <Link to="/admin/connexion">Se connecter</Link></p>
    </div>
  )
}
