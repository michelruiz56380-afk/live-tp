import { createClient } from '@supabase/supabase-js'

// Ces deux valeurs sont publiques par conception (la sécurité repose sur les
// règles RLS de supabase/schema.sql). Elles sont fournies par Netlify
// (variables d'environnement) ou par un fichier .env.local en développement.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
