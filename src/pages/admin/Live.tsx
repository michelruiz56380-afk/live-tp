import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { errorMessage, supabase } from '../../lib/supabase'
import {
  formatBytes, formatTime, fullName, signedUrl,
  type Exercise, type Participant, type ResponseFile, type ResponseRow, type Session, type Validation,
} from '../../lib/types'

const POLL_MS = 5000

interface Data {
  session: Session
  exercises: Exercise[]
  participants: Participant[]
  responses: ResponseRow[]
  files: ResponseFile[]
}

export default function Live() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [viewPos, setViewPos] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)

  const load = useCallback(async () => {
    const [s, ex, p, r, f] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).single(),
      supabase.from('exercises').select('*').eq('session_id', id).order('position'),
      supabase.from('participants').select('*').eq('session_id', id).order('last_name'),
      supabase.from('responses').select('*').eq('session_id', id),
      supabase.from('response_files').select('*').eq('session_id', id).order('created_at'),
    ])
    const err = s.error ?? ex.error ?? p.error ?? r.error ?? f.error
    if (err) return setError(errorMessage(err))
    setError('')
    setData({ session: s.data as Session, exercises: ex.data as Exercise[], participants: p.data as Participant[], responses: r.data as ResponseRow[], files: f.data as ResponseFile[] })
  }, [id])

  useEffect(() => {
    load()
    const t = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  if (!data) return <p className="page muted">{error || 'Chargement…'}</p>
  const { session, exercises, participants, responses, files } = data
  const joinUrl = `${window.location.origin}/s/${session.access_code}`
  const total = exercises.length
  const shownPos = viewPos ?? (session.current_position || 1)
  const shown = exercises.find(e => e.position === shownPos)

  async function update(values: Partial<Session>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    const { error } = await supabase.from('sessions').update(values).eq('id', session.id)
    if (error) setError(errorMessage(error))
    setViewPos(null)
    await load()
  }

  const respFor = (pid: string) => responses.find(r => r.participant_id === pid && r.exercise_id === shown?.id)
  const counts = participants.reduce(
    (acc, p) => {
      const r = respFor(p.id)
      if (!r) acc.todo++
      else if (r.status === 'submitted') acc.done++
      else acc.started++
      return acc
    },
    { todo: 0, started: 0, done: 0 },
  )
  const selectedParticipant = participants.find(p => p.id === selected) ?? null

  return (
    <div className="page wide">
      <p><Link to={`/admin/session/${session.id}`}>← Préparation de la session</Link></p>
      <div className="row between wrap">
        <div>
          <h1>{session.name}</h1>
          <p className="muted">
            {session.status === 'draft' && 'Pas encore démarrée'}
            {session.status === 'active' && <>En cours · exercice {session.current_position} / {total}</>}
            {session.status === 'completed' && 'Terminée'}
            {' · '}{participants.length} participant{participants.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="row gap">
          {session.status !== 'completed' && <button className="btn" onClick={() => setQrOpen(true)}>Afficher le QR code</button>}
          {session.status === 'draft' && (
            <button className="btn btn-primary" disabled={total === 0} onClick={() => update({ status: 'active', current_position: 1 })}>
              Démarrer la séance
            </button>
          )}
          {session.status === 'active' && session.current_position < total && (
            <button className="btn btn-primary" onClick={() => update({ current_position: session.current_position + 1 })}>
              Exercice suivant →
            </button>
          )}
          {session.status === 'active' && (
            <button className="btn btn-danger" onClick={() => update({ status: 'completed' }, 'Terminer la séance ? Les participants ne pourront plus rendre de réponse.')}>
              Fin de séance
            </button>
          )}
          {session.status === 'completed' && (
            <button className="btn" onClick={() => update({ status: 'active' }, 'Rouvrir la séance ?')}>Rouvrir la séance</button>
          )}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {total === 0 && <p className="notice warn">Ajoutez au moins un exercice avant de démarrer.</p>}

      {session.status === 'draft' && (
        <div className="card join-panel">
          <QrBlock url={joinUrl} code={session.access_code} />
          <div>
            <h2>En attente des participants</h2>
            {participants.length === 0 ? (
              <p className="muted">Personne n'a encore rejoint la séance.</p>
            ) : (
              <ul className="names">{participants.map(p => <li key={p.id}>{fullName(p)}</li>)}</ul>
            )}
          </div>
        </div>
      )}

      {session.status !== 'draft' && total > 0 && (
        <>
          <div className="row between wrap exercise-nav">
            <div className="row gap">
              <button className="btn btn-icon" aria-label="Exercice précédent" disabled={shownPos <= 1} onClick={() => setViewPos(shownPos - 1)}>←</button>
              <div>
                <div className="muted small">
                  Exercice {shownPos} / {total}
                  {shownPos === session.current_position && session.status === 'active' && <span className="badge badge-active">en cours</span>}
                </div>
                <strong>{shown?.title}</strong>
              </div>
              <button className="btn btn-icon" aria-label="Exercice suivant" disabled={shownPos >= total} onClick={() => setViewPos(shownPos + 1)}>→</button>
            </div>
            <div className="kpis">
              <span><strong>{counts.done}</strong> rendu{counts.done > 1 ? 's' : ''}</span>
              <span><strong>{counts.started}</strong> en cours</span>
              <span><strong>{counts.todo}</strong> non commencé{counts.todo > 1 ? 's' : ''}</span>
            </div>
          </div>
          {shownPos > session.current_position && session.status === 'active' && (
            <p className="notice small">Cet exercice n'est pas encore ouvert aux participants.</p>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Participant</th><th>Statut</th><th>Démarré</th><th>Rendu</th><th>Contenu</th><th>Validation</th></tr>
              </thead>
              <tbody>
                {participants.map(p => {
                  const r = respFor(p.id)
                  const n = r ? files.filter(f => f.response_id === r.id).length : 0
                  return (
                    <tr key={p.id} className={selected === p.id ? 'selected' : ''} onClick={() => r && setSelected(p.id)} style={{ cursor: r ? 'pointer' : 'default' }}>
                      <td>{fullName(p)}<div className="muted tiny">{p.email}</div></td>
                      <td><StatusBadge r={r} /></td>
                      <td>{formatTime(r?.started_at ?? null)}</td>
                      <td>{formatTime(r?.submitted_at ?? null)}</td>
                      <td className="nowrap">
                        {r?.content.trim() ? <span title="Texte">📝</span> : null}
                        {n > 0 ? <span title={`${n} fichier(s)`}> 📎{n}</span> : null}
                      </td>
                      <td><ValidationBadge v={r?.validation} /></td>
                    </tr>
                  )
                })}
                {participants.length === 0 && <tr><td colSpan={6} className="muted">Aucun participant.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedParticipant && shown && (
        <ResponsePanel
          participant={selectedParticipant}
          exercise={shown}
          response={respFor(selectedParticipant.id) ?? null}
          files={files.filter(f => f.response_id === respFor(selectedParticipant.id)?.id)}
          onClose={() => setSelected(null)}
          onChange={load}
          onPrev={() => {
            const withResp = participants.filter(p => respFor(p.id))
            const i = withResp.findIndex(p => p.id === selected)
            if (i > 0) setSelected(withResp[i - 1].id)
          }}
          onNext={() => {
            const withResp = participants.filter(p => respFor(p.id))
            const i = withResp.findIndex(p => p.id === selected)
            if (i >= 0 && i < withResp.length - 1) setSelected(withResp[i + 1].id)
          }}
        />
      )}

      {qrOpen && (
        <div className="qr-full" onClick={() => setQrOpen(false)}>
          <QrBlock url={joinUrl} code={session.access_code} big />
          <p className="muted">Cliquez n'importe où pour fermer</p>
        </div>
      )}
    </div>
  )
}

function QrBlock({ url, code, big = false }: { url: string; code: string; big?: boolean }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: big ? 560 : 260, margin: 1 }).then(setSrc).catch(() => setSrc(''))
  }, [url, big])
  const host = url.replace(/^https?:\/\//, '').replace(/\/s\/.*$/, '')
  return (
    <div className={big ? 'qr qr-big' : 'qr'}>
      {src && <img src={src} alt={`QR code vers ${url}`} />}
      <div className="qr-url">{host}</div>
      <div className="qr-code-label">Code de la séance</div>
      <div className="qr-code">{code}</div>
    </div>
  )
}

function StatusBadge({ r }: { r?: ResponseRow }) {
  if (!r) return <span className="badge">Non commencé</span>
  if (r.status === 'submitted') return <span className="badge badge-active">Rendu</span>
  return <span className="badge badge-warn">Démarré</span>
}

function ValidationBadge({ v }: { v?: Validation }) {
  if (v === 'ok') return <span className="badge badge-active">Validé</span>
  if (v === 'to_improve') return <span className="badge badge-warn">À améliorer</span>
  return <span className="muted">—</span>
}

function ResponsePanel({ participant, exercise, response, files, onClose, onChange, onPrev, onNext }: {
  participant: Participant; exercise: Exercise; response: ResponseRow | null; files: ResponseFile[]
  onClose: () => void; onChange: () => Promise<void>; onPrev: () => void; onNext: () => void
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const fileKey = files.map(f => f.id).join(',')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const out: Record<string, string> = {}
      for (const f of files) {
        try { out[f.id] = await signedUrl('responses', f.storage_path) } catch { /* fichier indisponible */ }
      }
      if (!cancelled) setUrls(out)
    })()
    return () => { cancelled = true }
  }, [fileKey])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  async function set(values: Partial<ResponseRow>, confirmText?: string) {
    if (!response) return
    if (confirmText && !window.confirm(confirmText)) return
    const { error } = await supabase.from('responses').update(values).eq('id', response.id)
    if (error) setError(errorMessage(error))
    await onChange()
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()} aria-label="Réponse du participant">
        <div className="row between">
          <div>
            <div className="muted small">{exercise.title}</div>
            <h2>{fullName(participant)}</h2>
          </div>
          <div className="row gap">
            <button className="btn btn-icon" aria-label="Participant précédent" onClick={onPrev}>←</button>
            <button className="btn btn-icon" aria-label="Participant suivant" onClick={onNext}>→</button>
            <button className="btn btn-icon" aria-label="Fermer" onClick={onClose}>×</button>
          </div>
        </div>
        {!response ? (
          <p className="muted">Pas encore commencé.</p>
        ) : (
          <div className="stack">
            <p className="muted small">
              {response.status === 'submitted' ? `Rendu à ${formatTime(response.submitted_at)}` : 'En cours de rédaction (brouillon)'}
            </p>
            {response.content ? <div className="answer preline">{response.content}</div> : <p className="muted">Pas de texte.</p>}
            {files.map(f => {
              const url = urls[f.id]
              const mime = f.mime_type ?? ''
              return (
                <figure key={f.id} className="media">
                  {url && mime.startsWith('image/') && <img src={url} alt={f.file_name} />}
                  {url && mime.startsWith('video/') && <video src={url} controls />}
                  <figcaption>
                    {url ? <a href={url} target="_blank" rel="noopener">{f.file_name}</a> : f.file_name}
                    {' '}<span className="muted small">{formatBytes(f.size_bytes)}</span>
                  </figcaption>
                </figure>
              )
            })}
            {error && <p className="error">{error}</p>}
            <div className="drawer-actions">
              <button className={response.validation === 'ok' ? 'btn btn-ok active' : 'btn btn-ok'} onClick={() => set({ validation: 'ok' })}>✓ Validé</button>
              <button className={response.validation === 'to_improve' ? 'btn btn-warn active' : 'btn btn-warn'} onClick={() => set({ validation: 'to_improve' })}>À améliorer</button>
              {response.status === 'submitted' && (
                <button className="btn btn-ghost" onClick={() => set({ status: 'started', submitted_at: null }, 'Déverrouiller cette réponse pour que le participant puisse la modifier ?')}>
                  Déverrouiller
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
