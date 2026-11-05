import { useEffect, useRef, useState } from 'react'
import { errorMessage, supabase } from '../../lib/supabase'
import { fullName, signedUrl, type Exercise, type Participant, type ResponseFile, type ResponseRow } from '../../lib/types'

export interface ProjectionItem {
  participant: Participant
  response: ResponseRow
  files: ResponseFile[]
}

/**
 * Affichage plein écran, pour le vidéoprojecteur : une réponse à la fois,
 * nom du participant en grand, contenu adapté (image, vidéo, PDF, texte).
 * Flèches ← → : participant précédent / suivant. Échap : quitter.
 */
export default function Projection({ exercise, items, startId, onClose, onChange }: {
  exercise: Exercise
  items: ProjectionItem[]
  startId: string | null
  onClose: () => void
  onChange: () => Promise<void>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [currentId, setCurrentId] = useState<string | null>(startId ?? items[0]?.participant.id ?? null)
  const [fileIndex, setFileIndex] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const index = Math.max(0, items.findIndex(i => i.participant.id === currentId))
  const item = items[index] ?? null
  const files = item?.files ?? []
  const file = files[Math.min(fileIndex, files.length - 1)] ?? null

  // Plein écran du navigateur (si autorisé), sinon simple calque plein écran.
  // Une seule fois à l'ouverture : le rafraîchissement du tableau ne doit pas
  // faire sortir du plein écran.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const el = rootRef.current
    if (el && !document.fullscreenElement) el.requestFullscreen?.().catch(() => undefined)
    function onFs() { if (!document.fullscreenElement) closeRef.current() }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  function go(delta: number) {
    const next = items[index + delta]
    if (!next) return
    setCurrentId(next.participant.id)
    setFileIndex(0)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1) }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      if (e.key === 'ArrowDown' && files.length > 1) { e.preventDefault(); setFileIndex(i => (i + 1) % files.length) }
      if (e.key === 'ArrowUp' && files.length > 1) { e.preventDefault(); setFileIndex(i => (i - 1 + files.length) % files.length) }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // URLs signées des fichiers du participant affiché et du suivant (préchargement).
  const wanted = [items[index], items[index + 1]].flatMap(i => i?.files ?? [])
  const wantedKey = wanted.map(f => f.id).join(',')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const missing = wanted.filter(f => !urls[f.id])
      if (!missing.length) return
      const add: Record<string, string> = {}
      for (const f of missing) {
        try { add[f.id] = await signedUrl('responses', f.storage_path) } catch { /* indisponible */ }
      }
      if (!cancelled) setUrls(u => ({ ...u, ...add }))
    })()
    return () => { cancelled = true }
  }, [wantedKey]) // eslint-disable-line

  async function validate(v: 'ok' | 'to_improve') {
    if (!item) return
    const { error } = await supabase.from('responses').update({ validation: v }).eq('id', item.response.id)
    setError(error ? errorMessage(error) : '')
    await onChange()
  }

  const text = item?.response.content.trim() ?? ''
  const hasMedia = files.length > 0
  const layout = hasMedia && text ? 'proj-split' : hasMedia ? 'proj-media-only' : 'proj-text-only'

  return (
    <div className="projection" ref={rootRef}>
      <header className="proj-head">
        <div>
          <div className="proj-exercise">Exercice {exercise.position} · {exercise.title}</div>
          <div className="proj-name">{item ? fullName(item.participant) : 'Aucune réponse'}</div>
        </div>
        <div className="proj-count">{items.length ? `${index + 1} / ${items.length}` : ''}</div>
      </header>

      <main className={`proj-body ${layout}`}>
        {!item && <p className="proj-empty">Aucune réponse à afficher pour cet exercice.</p>}
        {item && hasMedia && (
          <section className="proj-media">
            {file && <MediaView file={file} url={urls[file.id]} />}
            {files.length > 1 && (
              <div className="proj-thumbs">
                {files.map((f, i) => (
                  <button key={f.id} className={i === fileIndex ? 'proj-thumb active' : 'proj-thumb'} onClick={() => setFileIndex(i)}>
                    {i + 1}. {f.file_name}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        {item && text && <section className="proj-text">{item.response.content}</section>}
        {item && !text && !hasMedia && <p className="proj-empty">Réponse vide.</p>}
      </main>

      <footer className="proj-foot">
        <button className="btn" onClick={() => go(-1)} disabled={index <= 0}>← Précédent</button>
        {item && (
          <>
            {item.response.status !== 'submitted' && <span className="badge badge-warn">Brouillon (pas encore rendu)</span>}
            <button className={item.response.validation === 'ok' ? 'btn btn-ok active' : 'btn btn-ok'} onClick={() => validate('ok')}>✓ Validé</button>
            <button className={item.response.validation === 'to_improve' ? 'btn btn-warn active' : 'btn btn-warn'} onClick={() => validate('to_improve')}>À améliorer</button>
          </>
        )}
        {error && <span className="error">{error}</span>}
        <button className="btn" onClick={() => go(1)} disabled={index >= items.length - 1}>Suivant →</button>
        <button className="btn btn-ghost" onClick={onClose}>Quitter (Échap)</button>
      </footer>
    </div>
  )
}

function MediaView({ file, url }: { file: ResponseFile; url?: string }) {
  if (!url) return <div className="proj-loading">Chargement…</div>
  const mime = file.mime_type ?? ''
  const name = file.file_name.toLowerCase()
  if (mime.startsWith('image/')) return <img className="proj-img" src={url} alt={file.file_name} />
  if (mime.startsWith('video/')) return <video className="proj-video" src={url} controls autoPlay />
  if (mime === 'application/pdf' || name.endsWith('.pdf'))
    return (
      <>
        <iframe className="proj-pdf" src={url} title={file.file_name} />
        <a className="small" href={url} target="_blank" rel="noopener">Le PDF ne s'affiche pas ? Ouvrir dans un nouvel onglet</a>
      </>
    )
  return (
    <div className="proj-other">
      <p>{file.file_name}</p>
      <a className="btn btn-primary" href={url} target="_blank" rel="noopener">Ouvrir le fichier</a>
    </div>
  )
}
