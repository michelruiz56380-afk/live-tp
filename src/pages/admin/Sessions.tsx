import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'
import { formatDate, type Session, type SessionStatus } from '../../lib/types'
import { deleteSession, duplicateSession } from '../../lib/sessionOps'

const TABS: { status: SessionStatus; label: string }[] = [
  { status: 'draft', label: 'Brouillons' },
  { status: 'active', label: 'En cours' },
  { status: 'completed', label: 'Terminées' },
]

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [tab, setTab] = useState<SessionStatus>('draft')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('sessions').select('*').order('session_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setSessions(data as Session[])
  }, [])

  useEffect(() => { load() }, [load])

  async function onDuplicate(s: Session) {
    try {
      const id = await duplicateSession(s)
      navigate(`/admin/session/${id}`)
    } catch (e) { setError(errorMessage(e)) }
  }

  async function onDelete(s: Session) {
    if (!window.confirm(`Supprimer définitivement « ${s.name} », ses exercices, ses participants et toutes les réponses ?`)) return
    try {
      await deleteSession(s.id)
      load()
    } catch (e) { setError(errorMessage(e)) }
  }

  const shown = sessions.filter(s => s.status === tab)

  return (
    <div className="page">
      <div className="row between">
        <h1>Mes sessions</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>Nouvelle session</button>
      </div>
      {error && <p className="error">{error}</p>}

      <nav className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.status} role="tab" aria-selected={tab === t.status} className={tab === t.status ? 'tab active' : 'tab'} onClick={() => setTab(t.status)}>
            {t.label} <span className="count">{sessions.filter(s => s.status === t.status).length}</span>
          </button>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="muted">Aucune session ici.</p>
      ) : (
        <ul className="list">
          {shown.map(s => (
            <li key={s.id} className="card row between wrap">
              <div>
                <Link to={`/admin/session/${s.id}`} className="title-link">{s.name}</Link>
                <div className="muted small">
                  {[formatDate(s.session_date), s.location].filter(Boolean).join(' · ') || 'Sans date'} · code <code>{s.access_code}</code>
                </div>
              </div>
              <div className="row gap">
                <Link className="btn" to={`/admin/session/${s.id}`}>Préparer</Link>
                <Link className="btn btn-primary" to={`/admin/session/${s.id}/live`}>{s.status === 'draft' ? 'Lancer' : s.status === 'active' ? 'En direct' : 'Réponses'}</Link>
                <button className="btn" onClick={() => onDuplicate(s)}>Dupliquer</button>
                <button className="btn btn-danger-ghost" onClick={() => onDelete(s)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <SessionForm
          onClose={() => setCreating(false)}
          onSaved={id => navigate(`/admin/session/${id}`)}
        />
      )}
    </div>
  )
}

export function SessionForm({ session, onClose, onSaved }: { session?: Session; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(session?.name ?? '')
  const [date, setDate] = useState(session?.session_date ?? '')
  const [location, setLocation] = useState(session?.location ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const values = { name: name.trim(), session_date: date || null, location: location.trim() || null }
    const res = session
      ? await supabase.from('sessions').update(values).eq('id', session.id).select('id').single()
      : await supabase.from('sessions').insert(values).select('id').single()
    setBusy(false)
    if (res.error) setError(errorMessage(res.error))
    else onSaved(res.data.id)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal stack" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2>{session ? 'Modifier la session' : 'Nouvelle session'}</h2>
        <label>Nom<input required value={name} onChange={e => setName(e.target.value)} placeholder="Formation IA générative — groupe 1" autoFocus /></label>
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>Lieu<input value={location} onChange={e => setLocation(e.target.value)} placeholder="Salle, ville…" /></label>
        {error && <p className="error">{error}</p>}
        <div className="row gap end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{session ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </div>
  )
}
