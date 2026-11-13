import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { TeacherProvider, useTeacher } from './TeacherContext.jsx'
import { initialsOf } from './format.js'
import BrandLogo from '../components/BrandLogo.jsx'
import { useSignOut } from '../services/AuthContext.jsx'
import './teacher.css'

const NAV = [
  { items: [{ to: '/teacher', label: 'Home', end: true }] },
  { label: 'Plan', items: [
    { to: '/teacher/plan', label: 'New lesson' },
    { to: '/teacher/lessons', label: 'Lesson plans' },
    { to: '/teacher/resources', label: 'Resources' },
  ] },
  { label: 'My class', items: [
    { to: '/teacher/classes', label: 'Classes' },
    { to: '/teacher/profiles', label: 'Learners & codes' },
  ] },
  { label: 'Insights', items: [
    { to: '/teacher/insights', label: 'Class insights' },
    { to: '/teacher/activity', label: 'How Mothusi worked' },
  ] },
]

const isMobile = () => window.matchMedia('(max-width: 860px)').matches

export default function TeacherLayout() {
  return (
    <TeacherProvider>
      <Shell />
    </TeacherProvider>
  )
}

function Shell() {
  const { profile, profileSaveError, prefs, workspace, loadError, reload, saveState, toast, dismissToast } = useTeacher()
  const location = useLocation()
  const [open, setOpen] = useState(() => !isMobile() && prefs.menuDefault !== 'closed')

  // On phones the menu covers the page, so close it after choosing a page.
  useEffect(() => { if (isMobile()) setOpen(false) }, [location.pathname])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isMobile()) setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`theme-teacher teacher-shell ${prefs.largeText ? 'large-text' : ''}`}>
      <a className="skip-link" href="#t-main">Skip to content</a>
      <header className="t-topbar">
        <button
          type="button"
          className="t-burger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="t-sidebar"
          onClick={() => setOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
        <Link to="/teacher" className="t-logo" aria-label="Mothusi, teacher home">
          <BrandLogo />
        </Link>
        <SaveStatus state={workspace === 'ready' ? saveState : null} />
        <AccountMenu profile={profile} />
      </header>

      <div className="t-body">
        <aside id="t-sidebar" className={`t-side ${open ? 'open' : 'closed'}`} aria-label="Teacher menu">
          <nav className="t-nav" aria-label="Teacher navigation">
            {NAV.map((group, i) => (
              <div key={group.label || i} className="t-nav-group">
                {group.label && <p className="t-nav-label">{group.label}</p>}
                {group.items.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
              </div>
            ))}
          </nav>
          <p className="t-side-foot muted small-text">You make every decision. Mothusi prepares, checks and remembers.</p>
        </aside>

        {open && <div className="t-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

        <main className="t-main" id="t-main" tabIndex={-1}>
          {profileSaveError && <p className="t-error" role="alert">{profileSaveError}</p>}
          {workspace === 'loading' && <p className="t-loading" role="status">Loading your classes and lessons…</p>}
          {workspace === 'error' && (
            <section className="card stack" role="alert">
              <h1>Your workspace could not be loaded</h1>
              <p className="muted">{loadError}</p>
              <div><button type="button" className="btn" onClick={reload}>Try again</button></div>
            </section>
          )}
          {workspace === 'ready' && <Suspense fallback={<p className="t-loading" role="status">Loading…</p>}><Outlet /></Suspense>}
        </main>
      </div>

      {toast && (
        <div className="t-toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.action && (
            <button type="button" className="btn ghost small" onClick={() => { toast.action.run(); dismissToast() }}>
              {toast.action.label}
            </button>
          )}
          <button type="button" className="t-toast-close" aria-label="Dismiss" onClick={dismissToast}>×</button>
        </div>
      )}
    </div>
  )
}

function SaveStatus({ state }) {
  if (!state) return null
  const text = { saved: 'All changes saved', saving: 'Saving…', error: 'Not saved yet. Retrying…' }[state]
  return <span className={`t-save ${state}`} role="status" aria-live="polite"><span className="t-save-dot" aria-hidden="true" />{text}</span>
}

function AccountMenu({ profile }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()
  const signOut = useSignOut()

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="t-account-menu" ref={ref}>
      <button type="button" className="t-account" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="t-avatar small" aria-hidden="true">
          {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : initialsOf(profile.fullName)}
        </span>
        <span className="t-account-name">{profile.fullName}</span>
        <span className="t-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="t-menu" role="menu">
          <p className="t-menu-head"><strong>{profile.fullName}</strong><span className="muted small-text">{profile.email}</span></p>
          <button type="button" role="menuitem" onClick={() => navigate('/teacher/profile')}>Profile</button>
          <button type="button" role="menuitem" onClick={() => navigate('/teacher/settings')}>Settings</button>
          <button type="button" role="menuitem" className="t-menu-logout" onClick={signOut}>Log out</button>
        </div>
      )}
    </div>
  )
}
