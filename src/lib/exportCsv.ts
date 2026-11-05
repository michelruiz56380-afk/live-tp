import { supabase } from './supabase'
import type { Exercise, Participant, ResponseFile, ResponseRow, Session } from './types'

const LINK_DAYS = 7

function cell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function dateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

const STATUS = { started: 'Démarré', submitted: 'Rendu' } as const
const VALIDATION = { pending: '', ok: 'Validé', to_improve: 'À améliorer' } as const

/**
 * Export CSV (séparateur « ; », compatible Excel français) : une ligne par
 * participant et par exercice. Les liens vers les fichiers sont valables
 * LINK_DAYS jours (les fichiers sont privés).
 */
export async function exportSessionCsv(session: Session, exercises: Exercise[], participants: Participant[], responses: ResponseRow[], files: ResponseFile[]) {
  const paths = files.map(f => f.storage_path)
  const links: Record<string, string> = {}
  if (paths.length) {
    const { data } = await supabase.storage.from('responses').createSignedUrls(paths, LINK_DAYS * 24 * 3600)
    for (const d of data ?? []) if (d.path && d.signedUrl) links[d.path] = d.signedUrl
  }

  const header = ['Nom', 'Prénom', 'E-mail', 'N°', 'Exercice', 'Statut', 'Démarré le', 'Rendu le', 'Validation', 'Réponse', 'Fichiers', `Liens des fichiers (valables ${LINK_DAYS} jours)`]
  const rows: string[][] = []
  for (const p of participants) {
    for (const ex of exercises) {
      const r = responses.find(x => x.participant_id === p.id && x.exercise_id === ex.id)
      const fs = r ? files.filter(f => f.response_id === r.id) : []
      rows.push([
        p.last_name.toUpperCase(), p.first_name, p.email, String(ex.position), ex.title,
        r ? STATUS[r.status] : 'Non commencé', dateTime(r?.started_at ?? null), dateTime(r?.submitted_at ?? null),
        r ? VALIDATION[r.validation] : '', r?.content ?? '',
        fs.map(f => f.file_name).join(' | '), fs.map(f => links[f.storage_path] ?? '').filter(Boolean).join(' | '),
      ])
    }
  }

  const csv = '﻿' + [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const slug = session.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  const date = session.session_date ?? new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `livetp-${date}-${slug || 'session'}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
