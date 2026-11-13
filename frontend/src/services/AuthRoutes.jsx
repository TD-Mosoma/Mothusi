import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import './auth.css'
import BrandLogo from '../components/BrandLogo.jsx'
import { forgotPassword, resetPassword } from './api.js'
import { Picture } from '../components/Pictures.jsx'

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
        <Link className="auth-brand" to="/" aria-label="Mothusi home"><BrandLogo /></Link>
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
        <p className="auth-forgot"><Link to="/forgot-password">Forgot your password?</Link></p>
        <Link className="auth-pictures" to="/join">
          <span className="auth-pictures-art" aria-hidden="true"><Picture name="sun" size={26} /><Picture name="fish" size={26} /><Picture name="star" size={26} /></span>
          <span><strong>Young learner?</strong> Sign in with your class code and pictures</span>
        </Link>
        <div className="auth-links">
          <p>New learner? <Link to="/learner/onboarding">Create an account</Link></p>
          <p>Teacher? <Link to="/teacher/onboarding">Create a teacher account</Link></p>
        </div>
      </section>
    </main>
  )
}

function AuthCard({ title, intro, children }) {
  return (
    <main className="theme-learner auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/" aria-label="Mothusi home"><BrandLogo /></Link>
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="muted">{intro}</p>}
        {children}
      </section>
    </main>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      setSent(await forgotPassword(email.trim()))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" intro="If an account uses that address, we have sent a link to choose a new password. The link works for one hour.">
        {sent.dev_reset_link && (
          <p className="auth-note">
            Email is not set up on this server, so here is the link for testing: <a href={sent.dev_reset_link}>Choose a new password</a>
          </p>
        )}
        <p className="muted small-text">Young learners who sign in with pictures: ask your teacher to reset your pictures.</p>
        <p><Link to="/login">Back to log in</Link></p>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Forgot your password?" intro="Type the email address you use for Mothusi. We will send you a link to choose a new password.">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email address
          <input type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <button className="btn auth-submit" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send me a link'}</button>
      </form>
      <p><Link to="/login">Back to log in</Link></p>
    </AuthCard>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true); setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthCard title="This link is not complete" intro="Open the link from your email again, or ask for a new one.">
        <p><Link to="/forgot-password">Ask for a new link</Link></p>
      </AuthCard>
    )
  }
  if (done) {
    return (
      <AuthCard title="Your password is changed" intro="For your safety, you have been logged out on every device. Log in with your new password.">
        <Link className="btn auth-submit" to="/login">Log in</Link>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Choose a new password" intro="Use at least 8 characters.">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <form className="auth-form" onSubmit={submit}>
        <label>
          New password
          <input type="password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <label>
          Type it again
          <input type="password" minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        <button className="btn auth-submit" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </AuthCard>
  )
}

function AuthMessage({ children, ...props }) {
  return <main className="theme-learner auth-shell"><p {...props}>{children}</p></main>
}
