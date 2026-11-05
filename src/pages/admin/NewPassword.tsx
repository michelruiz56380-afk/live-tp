import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'

/** Page atteinte depuis le lien « mot de passe oublié » reçu par e-mail. */
export default function NewPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setReady(Boolean(s)))
    return () => data.subscription.unsubscribe()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 10) return setError('Le mot de passe doit faire au moins 10 caractères.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(errorMessage(error))
    else navigate('/admin', { replace: true })
  }

  return (
    <div className="page narrow">
      <h1>Nouveau mot de passe</h1>
      {!ready ? (
        <p className="muted">Lien invalide ou expiré. Redemandez un e-mail depuis la page de connexion.</p>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <label>Nouveau mot de passe<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary">Enregistrer</button>
        </form>
      )}
    </div>
  )
}
