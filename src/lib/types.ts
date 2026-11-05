export type SessionStatus = 'draft' | 'active' | 'completed'

export interface Session {
  id: string
  name: string
  session_date: string | null
  location: string | null
  access_code: string
  status: SessionStatus
  current_position: number
  created_at: string
}

export interface Exercise {
  id: string
  session_id: string
  position: number
  title: string
  instructions: string
}

export interface ExerciseFile {
  id: string
  exercise_id: string
  session_id: string
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
}

export const MAX_FILE_BYTES = 50 * 1024 * 1024

export function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

export function formatDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Nom de fichier sûr pour le stockage (sans accents ni caractères spéciaux). */
export function safeFileName(name: string): string {
  const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_')
  return `${Date.now()}_${clean}`.slice(0, 120)
}
