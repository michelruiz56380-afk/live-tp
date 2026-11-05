import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Home() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  function submit(e: FormEvent) {
    e.preventDefault()
    const clean = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    if (clean.length === 8) navigate(`/s/${clean}`)
  }

  return (
    <div className="page narrow center">
      <h1 className="hero">LiveTP</h1>
      <p className="muted">Entrez le code affiché par votre formateur.</p>
      <form className="stack" onSubmit={submit}>
        <input
          className="code-input"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={9}
          placeholder="ABCD2345"
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Code de la séance"
        />
        <button className="btn btn-primary" disabled={code.replace(/[^a-zA-Z0-9]/g, '').length !== 8}>Rejoindre</button>
      </form>
      <p className="footer-link"><Link to="/admin">Espace formateur</Link></p>
    </div>
  )
}
