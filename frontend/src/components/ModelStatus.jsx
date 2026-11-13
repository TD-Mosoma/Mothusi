import { useEffect, useState } from 'react'
import { getHealth } from '../services/api.js'

// Shows which model the agents will use, or that the backend cannot be reached.
export default function ModelStatus({ onStatus }) {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getHealth()
      .then((h) => { setHealth(h); onStatus?.(h) })
      .catch((e) => { setError(e.message); onStatus?.(null) })
  }, [])

  if (error) return <p className="t-error" role="alert">{error} Start it with <code>uv run uvicorn main:app</code> in the backend folder.</p>
  if (!health) return <p className="t-hint">Checking the agent service…</p>
  return (
    <p className="t-hint">
      Agents use <strong>{health.model}</strong>
      {health.live ? '.' : '. This offline model is rule-based and cannot translate.'}
    </p>
  )
}
