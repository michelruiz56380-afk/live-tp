import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, supabase } from '../../lib/supabase'
import { formatBytes, formatDate, MAX_FILE_BYTES, safeFileName, type Exercise, type ExerciseFile, type Session } from '../../lib/types'
import { SessionForm } from './Sessions'

const STATUS_LABEL = { draft: 'Brouillon', active: 'En cours', completed: 'Terminée' } as const

export default function SessionEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [files, setFiles] = useState<ExerciseFile[]>([])
  const [error, setError] = useState('')
  const [editingSession, setEditingSession] = useState(false)
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)

  const load = useCallback(async () => {
    const [s, ex, f] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
      supabase.from('exercises').select('*').eq('session_id', id).order('position'),
      supabase.from('exercise_files').select('*').eq('session_id', id).order('created_at'),
    ])
    const err = s.error ?? ex.error ?? f.error
    if (err) return setError(errorMessage(err))
    if (!s.data) return navigate('/admin', { replace: true })
    setSession(s.data as Session)
    setExercises(ex.data as Exercise[])
    setFiles(f.data as ExerciseFile[])
  }, [id, navigate])

  useEffect(() => { load() }, [load])

  async function run(action: () => PromiseLike<{ error: unknown }>) {
    const { error } = await action()
    if (error) setError(errorMessage(error))
    await load()
  }

  async function move(index: number, delta: number) {
    const a = exercises[index]
    const b = exercises[index + delta]
    if (!a || !b) return
    await run(async () => {
      const r1 = await supabase.from('exercises').update({ position: b.position }).eq('id', a.id)
      if (r1.error) return r1
      return supabase.from('exercises').update({ position: a.position }).eq('id', b.id)
    })
  }

  async function removeExercise(ex: Exercise) {
    if (!window.confirm(`Supprimer l'exercice « ${ex.title} » et les réponses associées ?`)) return
    const paths = files.filter(f => f.exercise_id === ex.id).map(f => f.storage_path)
    const { data: resp } = await supabase.from('response_files').select('storage_path, responses!inner(exercise_id)').eq('responses.exercise_id', ex.id)
    const respPaths = (resp ?? []).map(r => r.storage_path as string)
    if (paths.length) await supabase.storage.from('documents').remove(paths)
    if (respPaths.length) await supabase.storage.from('responses').remove(respPaths)
    await run(async () => {
      const del = await supabase.from('exercises').delete().eq('id', ex.id)
      if (del.error) return del
      // Renumérote pour garder des positions 1, 2, 3… sans trou.
      const rest = exercises.filter(e => e.id !== ex.id)
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].position !== i + 1) {
          const r = await supabase.from('exercises').update({ position: i + 1 }).eq('id', rest[i].id)
          if (r.error) return r
        }
      }
      return { error: null }
    })
  }

  if (!session) return <p className="page muted">{error || 'Chargement…'}</p>

  return (
    <div className="page">
      <p><Link to="/admin">← Mes sessions</Link></p>
      <div className="row between wrap">
        <div>
          <h1>{session.name}</h1>
          <p className="muted">
            {[formatDate(session.session_date), session.location].filter(Boolean).join(' · ')}
            {' '}<span className={`badge badge-${session.status}`}>{STATUS_LABEL[session.status]}</span>
          </p>
        </div>
        <div className="code-box">
          <span className="muted small">Code d'accès</span>
          <strong>{session.access_code}</strong>
        </div>
      </div>
      <div className="row gap">
        <button className="btn" onClick={() => setEditingSession(true)}>Modifier les informations</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="row between section-head">
        <h2>Exercices</h2>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>Ajouter un exercice</button>
      </div>

      {exercises.length === 0 && <p className="muted">Aucun exercice pour l'instant.</p>}
      <ol className="list">
        {exercises.map((ex, i) => (
          <li key={ex.id} className="card">
            <div className="row between wrap">
              <div className="grow">
                <div className="muted small">Exercice {ex.position}</div>
                <strong>{ex.title}</strong>
                {ex.instructions && <p className="preline clamp">{ex.instructions}</p>}
              </div>
              <div className="row gap">
                <button className="btn btn-icon" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn btn-icon" aria-label="Descendre" disabled={i === exercises.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn" onClick={() => setEditing(ex)}>Modifier</button>
                <button className="btn btn-danger-ghost" onClick={() => removeExercise(ex)}>Supprimer</button>
              </div>
            </div>
            <Documents exercise={ex} files={files.filter(f => f.exercise_id === ex.id)} onChange={load} onError={setError} />
          </li>
        ))}
      </ol>

      {editingSession && (
        <SessionForm session={session} onClose={() => setEditingSession(false)} onSaved={() => { setEditingSession(false); load() }} />
      )}
      {editing && (
        <ExerciseForm
          sessionId={session.id}
          exercise={editing === 'new' ? undefined : editing}
          nextPosition={exercises.length + 1}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function ExerciseForm({ sessionId, exercise, nextPosition, onClose, onSaved }: {
  sessionId: string; exercise?: Exercise; nextPosition: number; onClose: () => void; onSaved: () => void
}) {
  const [title, setTitle] = useState(exercise?.title ?? '')
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const values = { title: title.trim(), instructions }
    const res = exercise
      ? await supabase.from('exercises').update(values).eq('id', exercise.id)
      : await supabase.from('exercises').insert({ ...values, session_id: sessionId, position: nextPosition })
    setBusy(false)
    if (res.error) setError(errorMessage(res.error))
    else onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal stack" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2>{exercise ? "Modifier l'exercice" : 'Nouvel exercice'}</h2>
        <label>Titre<input required value={title} onChange={e => setTitle(e.target.value)} autoFocus /></label>
        <label>Consigne
          <textarea rows={10} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Ce que les participants doivent faire, ce qu'ils doivent rendre…" />
        </label>
        <p className="muted small">Les documents de travail s'ajoutent ensuite, sous l'exercice.</p>
        {error && <p className="error">{error}</p>}
        <div className="row gap end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>Enregistrer</button>
        </div>
      </form>
    </div>
  )
}

function Documents({ exercise, files, onChange, onError }: {
  exercise: Exercise; files: ExerciseFile[]; onChange: () => void; onError: (m: string) => void
}) {
  const [uploading, setUploading] = useState(false)

  async function upload(list: FileList | null) {
    if (!list?.length) return
    setUploading(true)
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) { onError(`« ${file.name} » dépasse 50 Mo.`); continue }
      const path = `${exercise.session_id}/${exercise.id}/${safeFileName(file.name)}`
      const up = await supabase.storage.from('documents').upload(path, file, { contentType: file.type || undefined })
      if (up.error) { onError(errorMessage(up.error)); continue }
      const ins = await supabase.from('exercise_files').insert({
        exercise_id: exercise.id, session_id: exercise.session_id, file_name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size,
      })
      if (ins.error) onError(errorMessage(ins.error))
    }
    setUploading(false)
    onChange()
  }

  async function open(f: ExerciseFile) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(f.storage_path, 300)
    if (error) return onError(errorMessage(error))
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove(f: ExerciseFile) {
    if (!window.confirm(`Retirer « ${f.file_name} » ?`)) return
    await supabase.storage.from('documents').remove([f.storage_path])
    const { error } = await supabase.from('exercise_files').delete().eq('id', f.id)
    if (error) onError(errorMessage(error))
    onChange()
  }

  return (
    <div className="docs">
      <span className="muted small">Documents de travail :</span>
      {files.map(f => (
        <span key={f.id} className="chip">
          <button className="link" onClick={() => open(f)}>{f.file_name}</button>
          <span className="muted small">{formatBytes(f.size_bytes)}</span>
          <button className="link danger" aria-label={`Retirer ${f.file_name}`} onClick={() => remove(f)}>×</button>
        </span>
      ))}
      <label className="btn btn-small">
        {uploading ? 'Envoi…' : '+ Ajouter'}
        <input type="file" multiple hidden disabled={uploading} onChange={e => { upload(e.target.files); e.target.value = '' }} />
      </label>
    </div>
  )
}
