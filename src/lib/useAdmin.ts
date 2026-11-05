import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AdminState = 'loading' | 'signed-out' | 'not-admin' | 'admin'

/**
 * Indique si l'utilisateur connecté est formateur. Au premier passage, un
 * compte dont l'e-mail figure dans les adresses autorisées devient formateur
 * (fonction claim_trainer).
 */
export function useAdmin(): { state: AdminState; email: string | null } {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)
  const [state, setState] = useState<AdminState>('loading')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = auth?.user.id
  const anonymous = auth?.user.is_anonymous

  useEffect(() => {
    if (auth === undefined) return
    if (!userId || anonymous) {
      setState('signed-out')
      return
    }
    let cancelled = false
    setState('loading')
    ;(async () => {
      const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
      if (data) return !cancelled && setState('admin')
      const { data: claimed } = await supabase.rpc('claim_trainer')
      if (!cancelled) setState(claimed ? 'admin' : 'not-admin')
    })()
    return () => { cancelled = true }
  }, [userId, anonymous, auth === undefined])

  return { state, email: auth?.user.email ?? null }
}
