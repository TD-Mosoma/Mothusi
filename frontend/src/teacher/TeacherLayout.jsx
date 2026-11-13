import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../services/AuthContext.jsx'
import { TeacherProvider, useTeacher } from './TeacherContext.jsx'
import { initialsOf } from './format.js'
import logo from '../assets/logo.jpeg'
import './teacher.css'

const NAV = [
  { to: '/teacher', label: 'Dashboard', end: true },
  { to: '/teacher/classes', label: 'My Classes' },
  { to: '/teacher/profiles', label: 'Learner Profiles' },
  { to: '/teacher/plan', label: 'Lesson Planner' },
  { to: '/teacher/lessons', label: 'Lesson Plans & Reviews' },
  { to: '/teacher/activity', label: 'Agent Activity' },
  { to: '/teacher/resources', label: 'Resources' },
  { to: '/teacher/profile', label: 'My Profile' },
  { to: '/teacher/settings', label: 'Settings' },
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
  const { profile, profileSaveError, prefs } = useTeacher()
  const { signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => !isMobile() && prefs.menuDefault !== 'closed')

  // On phones the menu covers the page, so close it after choosing a page.
  useEffect(() => { if (isMobile()) setOpen(false) }, [location.pathname])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`theme-teacher teacher-shell ${prefs.largeText ? 'large-text' : ''}`}>
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
        <Link to="/teacher" className="t-logo" aria-label="Mothusi, teacher portal">
          <img src={logo} alt="Mothusi" />
        </Link>
        <Link to="/teacher/profile" className="t-account" aria-label="My profile">
          <span className="t-avatar small">
            {profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : initialsOf(profile.fullName)}
          </span>
          <span className="t-account-name">{profile.fullName}</span>
        </Link>
      </header>

      <div className="t-body">
        <aside id="t-sidebar" className={`t-side ${open ? 'open' : 'closed'}`} aria-label="Teacher menu">
          <nav className="t-nav" aria-label="Teacher navigation">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
            ))}
          </nav>
          <button type="button" className="t-logout" onClick={async () => {
            try { await signOut() } catch (error) {
              navigate('/login', { replace: true, state: { message: error.message } })
            }
          }}>Log out</button>
        </aside>

        {open && <div className="t-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

        <main className="t-main">
          {profileSaveError && <p role="alert">{profileSaveError}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
