import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'

interface SessionInfo { id: string; name: string; status: string }

/** Garantit une connexion (anonyme si besoin) pour le participant. */
export async function ensureParticipantAuth(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return anon.user!.id
}

export default function Join() {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [info, setInfo] = useState<SessionInfo | null | undefined>(undefined)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'new' | 'resume'>('new')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('session_by_code', { p_code: code })
      if (cancelled) return
      if (error) return setError(errorMessage(error))
      const s = (data as SessionInfo[])[0] ?? null
      setInfo(s)
      if (!s) return
      // Déjà inscrit sur cet appareil ? On reprend directement.
      const { data: auth } = await supabase.auth.getSession()
      if (auth.session) {
        const { data: me } = await supabase.from('participants').select('id').eq('session_id', s.id).eq('user_id', auth.session.user.id).maybeSingle()
        if (me && !cancelled) navigate(`/s/${code}/travail`, { replace: true })
      }
    })()
    return () => { cancelled = true }
  }, [code, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await ensureParticipantAuth()
      const { error } = mode === 'resume'
        ? await supabase.rpc('resume_session', { p_code: code, p_email: email })
        : await supabase.rpc('join_session', { p_code: code, p_first: first, p_last: last, p_email: email })
      if (error) throw error
      navigate(`/s/${code}/travail`, { replace: true })
    } catch (err) {
      const msg = errorMessage(err)
      setError(/anonymous/i.test(msg) ? "L'accès participant n'est pas encore activé. Prévenez votre formateur." : msg)
    } finally {
      setBusy(false)
    }
  }

  if (info === undefined) return <p className="page muted">{error || 'Chargement…'}</p>
  if (info === null)
    return (
      <div className="page narrow center">
        <h1>Code inconnu</h1>
        <p className="muted">Le code <code>{code}</code> ne correspond à aucune séance.</p>
        <Link className="btn" to="/">Ressaisir le code</Link>
      </div>
    )
  if (info.status === 'completed')
    return (
      <div className="page narrow center">
        <h1>{info.name}</h1>
        <p className="muted">Cette séance est terminée.</p>
      </div>
    )

  return (
    <div className="page narrow">
      <p className="muted small">Séance</p>
      <h1>{info.name}</h1>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'tab active' : 'tab'} onClick={() => { setMode('new'); setError('') }}>
          Première connexion
        </button>
        <button type="button" role="tab" aria-selected={mode === 'resume'} className={mode === 'resume' ? 'tab active' : 'tab'} onClick={() => { setMode('resume'); setError('') }}>
          Déjà inscrit ?
        </button>
      </div>
      <form className="card stack" onSubmit={submit}>
        {mode === 'new' ? (
          <>
            <label>Prénom<input required value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" /></label>
            <label>Nom<input required value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" /></label>
            <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
            <p className="notice small">
              Vos nom, prénom, e-mail et réponses sont enregistrés pour le suivi de cette formation par le formateur,
              hébergés en Europe et supprimés au plus tard 6 mois après la séance. Vous pouvez demander leur suppression au formateur.
            </p>
            <p className="notice warn small">
              Vos réponses peuvent être projetées devant le groupe : n'y mettez <strong>aucune donnée client ni information confidentielle</strong>.
            </p>
          </>
        ) : (
          <>
            <p className="muted small">Saisissez l'e-mail utilisé lors de votre inscription pour reprendre là où vous en étiez.</p>
            <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus /></label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Connexion…' : mode === 'new' ? 'Rejoindre la séance' : 'Reprendre ma séance'}
        </button>
      </form>
    </div>
  )
}
