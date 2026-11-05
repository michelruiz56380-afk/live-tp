import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase'
import RequireAdmin from './components/RequireAdmin'
import Login from './pages/admin/Login'
import Sessions from './pages/admin/Sessions'
import SessionEdit from './pages/admin/SessionEdit'
import Home from './pages/Home'
import Signup from './pages/admin/Signup'
import NewPassword from './pages/admin/NewPassword'
import Trainers from './pages/admin/Trainers'

export default function App() {
  if (!isConfigured)
    return (
      <div className="page narrow">
        <h1>LiveTP</h1>
        <p className="error">Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.</p>
      </div>
    )
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/connexion" element={<Login />} />
        <Route path="/admin/inscription" element={<Signup />} />
        <Route path="/admin/mot-de-passe" element={<NewPassword />} />
        <Route path="/admin/formateurs" element={<RequireAdmin><Trainers /></RequireAdmin>} />
        <Route path="/admin" element={<RequireAdmin><Sessions /></RequireAdmin>} />
        <Route path="/admin/session/:id" element={<RequireAdmin><SessionEdit /></RequireAdmin>} />
        <Route path="*" element={<div className="page narrow"><h1>Page introuvable</h1><Link to="/">Accueil</Link></div>} />
      </Routes>
    </BrowserRouter>
  )
}
