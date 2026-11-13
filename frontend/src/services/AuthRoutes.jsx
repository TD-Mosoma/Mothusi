import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import './auth.css'

export function RequireRole({ role, children }) {
  const { user, loading, error } = useAuth()
  if (loading) return <AuthMessage>Checking your account…</AuthMessage>
  if (!user) {
    if (error) return <AuthMessage role="alert">{error} <Link to="/login">Go to login</Link></AuthMessage>
    return <Navigate to="/login" replace />
  }
  if (user.role !== role) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/learner'} replace />
  return children
}

export function GuestOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthMessage>Checking your account…</AuthMessage>
  if (user) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/learner'} replace />
  return children
}

export function LoginPage() {
  const { signIn, error: authError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.message || '')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await signIn(email, password)
      const target = user.role === 'teacher' ? '/teacher' : '/learner'
      navigate(location.state?.from || target, { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="theme-learner auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/">Mothusi</Link>
        <h1 id="auth-title">Log in</h1>
        <p className="muted">Use your registered email and password. We’ll open the right portal for your account.</p>
        {(error || authError) && <p className="auth-error" role="alert">{error || authError}</p>}
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email address
            <input
              type="email"
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <div className="auth-links">
          <p>New learner? <Link to="/learner/onboarding">Create an account</Link></p>
          <p>Teacher? <Link to="/teacher/onboarding">Create a teacher account</Link></p>
        </div>
      </section>
    </main>
  )
}

function AuthMessage({ children, ...props }) {
  return <main className="theme-learner auth-shell"><p {...props}>{children}</p></main>
}
