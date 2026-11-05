import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAdmin } from '../lib/useAdmin'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { state, email } = useAdmin()
  if (state === 'loading') return <p className="page muted">Chargement…</p>
  if (state === 'signed-out') return <Navigate to="/admin/connexion" replace />
  if (state === 'not-admin')
    return (
      <div className="page narrow">
        <h1>Accès refusé</h1>
        <p>Le compte {email} n'est pas autorisé comme formateur.</p>
        <p className="muted small">Demandez à un formateur d'ajouter cette adresse dans la rubrique « Formateurs », puis reconnectez-vous.</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>{' '}
        <Link to="/">Accueil</Link>
      </div>
    )
  return (
    <>
      <header className="topbar">
        <Link to="/admin" className="brand">LiveTP <span className="muted">· formateur</span></Link>
        <span className="topbar-right">
          <Link to="/admin/formateurs" className="btn btn-ghost">Formateurs</Link>
          <span className="muted small">{email}</span>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
        </span>
      </header>
      {children}
    </>
  )
}
