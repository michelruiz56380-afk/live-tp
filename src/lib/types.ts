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

export interface Participant {
  id: string
  session_id: string
  first_name: string
  last_name: string
  email: string
  created_at: string
}

export type ResponseStatus = 'started' | 'submitted'
export type Validation = 'pending' | 'ok' | 'to_improve'

export interface ResponseRow {
  id: string
  exercise_id: string
  participant_id: string
  session_id: string
  content: string
  status: ResponseStatus
  validation: Validation
  started_at: string
  submitted_at: string | null
}

export interface ResponseFile {
  id: string
  response_id: string
  participant_id: string
  session_id: string
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
}

export function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function fullName(p: { first_name: string; last_name: string }): string {
  const first = p.first_name.charAt(0).toUpperCase() + p.first_name.slice(1)
  return `${first} ${p.last_name.toUpperCase()}`
}

/** Ouvre un fichier privé dans un nouvel onglet via une URL signée (5 min). */
export async function signedUrl(bucket: 'documents' | 'responses', path: string): Promise<string> {
  const { supabase } = await import('./supabase')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}
