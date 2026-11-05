import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'
import {
  formatBytes, fullName, MAX_FILE_BYTES, safeFileName, signedUrl,
  type Exercise, type ExerciseFile, type Participant, type ResponseFile, type ResponseRow, type Session,
} from '../../lib/types'

const MAX_FILES = 5
const POLL_MS = 4000

interface State {
  session: Session
  me: Participant
  exercises: Exercise[]
  docs: ExerciseFile[]
  responses: ResponseRow[]
  files: ResponseFile[]
}

export default function Work() {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data: info } = await supabase.rpc('session_by_code', { p_code: code })
    const sessionId = (info as { id: string }[] | null)?.[0]?.id
    if (!sessionId) return navigate(`/s/${code}`, { replace: true })
    const { data: auth } = await supabase.auth.getSession()
    const uid = auth.session?.user.id
    if (!uid) return navigate(`/s/${code}`, { replace: true })
    const { data: me } = await supabase.from('participants').select('*').eq('session_id', sessionId).eq('user_id', uid).maybeSingle()
    if (!me) return navigate(`/s/${code}`, { replace: true })
    const [s, ex, docs, resp, files] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('exercises').select('*').eq('session_id', sessionId).order('position'),
      supabase.from('exercise_files').select('*').eq('session_id', sessionId).order('created_at'),
      supabase.from('responses').select('*').eq('participant_id', me.id),
      supabase.from('response_files').select('*').eq('participant_id', me.id).order('created_at'),
    ])
    const err = s.error ?? ex.error ?? docs.error ?? resp.error ?? files.error
    if (err) return setError(errorMessage(err))
    setError('')
    setState({
      session: s.data as Session, me: me as Participant, exercises: ex.data as Exercise[],
      docs: docs.data as ExerciseFile[], responses: resp.data as ResponseRow[], files: files.data as ResponseFile[],
    })
  }, [code, navigate])

  useEffect(() => {
    load()
    const t = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  if (!state) return <p className="page muted">{error || 'Chargement…'}</p>
  const { session, me, exercises } = state
  const current = exercises.find(e => e.position === session.current_position)

  return (
    <div className="page narrow">
      <header className="participant-head">
        <div>
          <div className="muted small">{session.name}</div>
          <strong>{fullName(me)}</strong>
        </div>
        {current && <span className="badge">Exercice {current.position}</span>}
      </header>
      {error && <p className="error">{error}</p>}

      {session.status === 'draft' && (
        <div className="card center stack waiting">
          <div className="pulse" aria-hidden />
          <h2>Vous êtes inscrit</h2>
          <p className="muted">La séance va bientôt commencer. Cette page se met à jour toute seule.</p>
        </div>
      )}

      {session.status === 'completed' && (
        <div className="card center stack">
          <h2>Séance terminée</h2>
          <p className="muted">Merci pour votre participation.</p>
          <Link to="/" className="btn">Accueil</Link>
        </div>
      )}

      {session.status === 'active' && !current && (
        <div className="card center"><p className="muted">En attente du prochain exercice…</p></div>
      )}

      {session.status === 'active' && current && (
        <ExerciseView
          key={current.id}
          exercise={current}
          docs={state.docs.filter(d => d.exercise_id === current.id)}
          response={state.responses.find(r => r.exercise_id === current.id) ?? null}
          files={state.files.filter(f => state.responses.find(r => r.id === f.response_id)?.exercise_id === current.id)}
          participant={me}
          onChange={load}
        />
      )}
    </div>
  )
}

function ExerciseView({ exercise, docs, response, files, participant, onChange }: {
  exercise: Exercise; docs: ExerciseFile[]; response: ResponseRow | null; files: ResponseFile[]
  participant: Participant; onChange: () => Promise<unknown> | void
}) {
  const [text, setText] = useState(response?.content ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const initialised = useRef(Boolean(response))

  // Le texte n'est repris du serveur qu'une fois (pour ne pas écraser la saisie).
  useEffect(() => {
    if (response && !initialised.current) {
      initialised.current = true
      setText(response.content)
    }
  }, [response])

  const submitted = response?.status === 'submitted'

  async function act(fn: () => Promise<{ error: unknown } | void>) {
    setBusy(true)
    setError('')
    try {
      const res = await fn()
      if (res && res.error) throw res.error
      await onChange()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function openDoc(path: string, bucket: 'documents' | 'responses') {
    try { window.open(await signedUrl(bucket, path), '_blank', 'noopener') } catch (e) { setError(errorMessage(e)) }
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return
    const chosen = Array.from(list)
    if (files.length + chosen.length > MAX_FILES) return setError(`${MAX_FILES} fichiers au maximum par réponse.`)
    const tooBig = chosen.find(f => f.size > MAX_FILE_BYTES)
    if (tooBig) return setError(`« ${tooBig.name} » dépasse 50 Mo.`)
    await act(async () => {
      for (const f of chosen) {
        const path = `${exercise.session_id}/${participant.id}/${exercise.id}/${safeFileName(f.name)}`
        const up = await supabase.storage.from('responses').upload(path, f, { contentType: f.type || undefined })
        if (up.error) throw up.error
        const { error } = await supabase.rpc('add_response_file', {
          p_exercise: exercise.id, p_path: path, p_name: f.name, p_mime: f.type || null, p_size: f.size,
        })
        if (error) {
          await supabase.storage.from('responses').remove([path])
          throw error
        }
      }
    })
  }

  async function removeFile(f: ResponseFile) {
    await act(async () => {
      const { data, error } = await supabase.rpc('remove_response_file', { p_file: f.id })
      if (error) throw error
      await supabase.storage.from('responses').remove([data as string])
    })
  }

  async function save(submit: boolean) {
    if (submit && !text.trim() && files.length === 0) return setError('Votre réponse est vide.')
    if (submit && !window.confirm('Rendre votre réponse ? Vous ne pourrez plus la modifier.')) return
    await act(async () => {
      const res = await supabase.rpc('save_response', { p_exercise: exercise.id, p_content: text, p_submit: submit })
      if (!res.error && !submit) setSaved(`Brouillon enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`)
      return res
    })
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>{exercise.title}</h2>
        {exercise.instructions && <p className="preline">{exercise.instructions}</p>}
        {docs.length > 0 && (
          <div className="docs">
            <span className="muted small">Documents :</span>
            {docs.map(d => (
              <button key={d.id} className="chip link" onClick={() => openDoc(d.storage_path, 'documents')}>
                {d.file_name} <span className="muted small">{formatBytes(d.size_bytes)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {!response && (
        <button className="btn btn-primary btn-large" disabled={busy} onClick={() => act(async () => supabase.rpc('start_exercise', { p_exercise: exercise.id }))}>
          C'est clair, je démarre
        </button>
      )}

      {response && submitted && (
        <section className="card stack done">
          <p><strong>✓ Réponse rendue</strong> <span className="muted small">— elle est verrouillée.</span></p>
          {response.content && <p className="preline answer">{response.content}</p>}
          <FileList files={files} onOpen={f => openDoc(f.storage_path, 'responses')} />
          <p className="muted small">Attendez la suite de la séance.</p>
        </section>
      )}

      {response && !submitted && (
        <section className="card stack">
          <label>Votre réponse
            <textarea rows={10} value={text} onChange={e => { setText(e.target.value); setSaved('') }}
              placeholder="Collez ici votre prompt, le résultat obtenu, vos remarques…" />
          </label>
          <div>
            <FileList files={files} onOpen={f => openDoc(f.storage_path, 'responses')} onRemove={removeFile} />
            {files.length < MAX_FILES && (
              <label className="btn btn-small">
                + Ajouter un fichier (image, vidéo, PDF…)
                <input type="file" multiple hidden disabled={busy} onChange={e => { upload(e.target.files); e.target.value = '' }} />
              </label>
            )}
            <p className="muted small">{MAX_FILES} fichiers au maximum, 50 Mo par fichier.</p>
          </div>
          {error && <p className="error">{error}</p>}
          {saved && <p className="success small">{saved}</p>}
          <div className="row gap end">
            <button className="btn" disabled={busy} onClick={() => save(false)}>Enregistrer le brouillon</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Rendre ma réponse</button>
          </div>
        </section>
      )}
      {!response && error && <p className="error">{error}</p>}
    </div>
  )
}

function FileList({ files, onOpen, onRemove }: { files: ResponseFile[]; onOpen: (f: ResponseFile) => void; onRemove?: (f: ResponseFile) => void }) {
  if (!files.length) return null
  return (
    <div className="docs" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
      {files.map(f => (
        <span key={f.id} className="chip">
          <button className="link" onClick={() => onOpen(f)}>{f.file_name}</button>
          <span className="muted small">{formatBytes(f.size_bytes)}</span>
          {onRemove && <button className="link danger" aria-label={`Retirer ${f.file_name}`} onClick={() => onRemove(f)}>×</button>}
        </span>
      ))}
    </div>
  )
}
