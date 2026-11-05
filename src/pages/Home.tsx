import { Link } from 'react-router-dom'

// Étape 2 : saisie du code de session par les participants.
export default function Home() {
  return (
    <div className="page narrow center">
      <h1 className="hero">LiveTP</h1>
      <p className="muted">L'accès participant arrive à l'étape 2.</p>
      <p className="footer-link"><Link to="/admin">Espace formateur</Link></p>
    </div>
  )
}
