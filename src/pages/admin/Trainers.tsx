import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { errorMessage, supabase } from '../../lib/supabase'

interface Invite { email: string; created_at: string }

/** Adresses autorisées à créer un compte formateur. */
export default function Trainers() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('trainer_invites').select('*').order('created_at')
    if (error) setError(errorMessage(error))
    else setInvites(data as Invite[])
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('trainer_invites').insert({ email: email.trim().toLowerCase() })
    if (error) return setError(error.code === '23505' ? 'Adresse déjà autorisée.' : errorMessage(error))
    setEmail('')
    load()
  }

  async function remove(i: Invite) {
    if (!window.confirm(`Retirer l'autorisation de ${i.email} ? Un compte déjà créé reste formateur.`)) return
    const { error } = await supabase.from('trainer_invites').delete().eq('email', i.email)
    if (error) setError(errorMessage(error))
    load()
  }

  return (
    <div className="page narrow">
      <h1>Formateurs</h1>
      <p className="muted">
        Une adresse autorisée ici peut créer son compte depuis la page « Créer mon compte formateur »
        (lien sous le formulaire de connexion). Elle devient formateur après confirmation de son e-mail.
      </p>
      <form className="row gap" onSubmit={add}>
        <input type="email" required placeholder="adresse@exemple.fr" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-primary">Autoriser</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {invites.map(i => (
          <li key={i.email} className="card row between wrap">
            <span>{i.email}</span>
            <button className="btn btn-danger-ghost" onClick={() => remove(i)}>Retirer</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
