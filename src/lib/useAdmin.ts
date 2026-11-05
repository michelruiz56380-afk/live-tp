import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AdminState = 'loading' | 'signed-out' | 'not-admin' | 'admin'

/** Indique si l'utilisateur connecté est le formateur (table admins). */
export function useAdmin(): { state: AdminState; email: string | null } {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)
  const [state, setState] = useState<AdminState>('loading')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (auth === undefined) return
    if (!auth || auth.user.is_anonymous) {
      setState('signed-out')
      return
    }
    setState('loading')
    supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', auth.user.id)
      .maybeSingle()
      .then(({ data }) => setState(data ? 'admin' : 'not-admin'))
  }, [auth])

  return { state, email: auth?.user.email ?? null }
}
