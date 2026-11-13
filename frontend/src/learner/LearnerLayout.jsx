import { Suspense, useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useSignOut } from '../services/AuthContext.jsx'
import LanguagePicker from '../components/LanguagePicker.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import './learner.css'
import { getLearnerProfile, saveLearnerProfile } from '../services/profile.js'
import { getLearningPreferences } from '../services/learnerPortal.js'
import { translate } from './translations.js'

const NAV_ITEMS = [
  { to: '/learner', label: 'Home', icon: '⌂', end: true },
  { to: '/learner/lessons', label: 'My lessons', icon: '▤' },
  { to: '/learner/topic', label: 'Learn a topic', icon: '✦' },
  { to: '/learner/practice', label: 'Practice', icon: '✎' },
  { to: '/learner/progress', label: 'My progress', icon: '★' },
  { to: '/learner/saved', label: 'Saved learning', icon: '♡' },
]

const isMobile = () => window.matchMedia('(max-width: 860px)').matches

export default function LearnerLayout() {
  const location = useLocation()
  const signOut = useSignOut()
  const [menuOpen, setMenuOpen] = useState(() => !isMobile())
  const [profile, setProfile] = useState(getLearnerProfile)
  const [lang, setLangState] = useState(profile?.language || 'en')
  const [largeText, setLargeText] = useState(() => getLearningPreferences().textSize === 'large')
  const [languageSaveError, setLanguageSaveError] = useState('')
  const firstName = profile?.fullName?.trim().split(' ')[0]

  // Language is the learner's own choice; remember it with their profile.
  const setLang = async (language) => {
    const next = { ...(profile || {}), language }
    setLanguageSaveError('')
    try {
      await saveLearnerProfile(next)
      setProfile(next)
      setLangState(language)
    } catch (error) {
      setLanguageSaveError(error.message)
    }
  }


  useEffect(() => {
    if (isMobile()) setMenuOpen(false)
    const nextProfile = getLearnerProfile()
    setProfile(nextProfile)
    setLangState(nextProfile?.language || 'en')
    setLargeText(getLearningPreferences().textSize === 'large')
  }, [location.pathname])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return (
    <div className={`theme-learner learner-shell${largeText ? ' l-larger-text' : ''}`}>
      <header className="l-topbar">
        <button
          type="button"
          className="l-burger"
          aria-label={translate(lang, menuOpen ? 'Close menu' : 'Open menu')}
          aria-expanded={menuOpen}
          aria-controls="l-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span /><span />
        </button>
        <Link to="/learner" className="l-logo" aria-label={translate(lang, 'Mothusi learner portal')}>
          <BrandLogo />
        </Link>
        <div className="l-topbar-right">
          <span className="l-top-greeting">{firstName ? translate(lang, 'Hi, {name}!', { name: firstName }) : translate(lang, 'Your learning space')}</span>
          <LanguagePicker value={lang} onChange={setLang} />
        </div>
      </header>
      {languageSaveError && <p className="l-signout-error" role="alert">{languageSaveError}</p>}
      <div className="l-body">
        <aside id="l-sidebar" className={`l-sidebar ${menuOpen ? 'open' : 'closed'}`} aria-label={translate(lang, 'MY LEARNING')}>
          <p className="l-nav-label">{translate(lang, 'MY LEARNING')}</p>
          <nav className="l-nav" aria-label={translate(lang, 'MY LEARNING')}>
            {NAV_ITEMS.map(({ to, label, icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `l-nav-link${isActive ? ' active' : ''}`}>
                <span className="l-nav-icon" aria-hidden="true">{icon}</span>{translate(lang, label)}
              </NavLink>
            ))}
          </nav>
          <div className="l-sidebar-bottom">
            <NavLink to="/learner/preferences" className={({ isActive }) => `l-nav-link${isActive ? ' active' : ''}`}>
              <span className="l-nav-icon" aria-hidden="true">⚙</span>{translate(lang, 'Language & access')}
            </NavLink>
            <NavLink to="/learner/profile" className={({ isActive }) => `l-account${isActive ? ' active' : ''}`}>
              <span className="l-avatar" aria-hidden="true">{firstName?.[0]?.toUpperCase() || 'L'}</span>
              <span><strong>{firstName || 'Learner'}</strong><small>{translate(lang, 'My profile')}</small></span>
              <span aria-hidden="true">›</span>
            </NavLink>
            <button type="button" className="l-signout" onClick={signOut}>{translate(lang, 'Log out')}</button>
          </div>
        </aside>
        {menuOpen && <div className="l-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
        <main className="l-main">
          <Suspense fallback={<p className="l-inline-status" role="status">{translate(lang, 'Loading…')}</p>}>
            <Outlet context={{ lang, setLang, profile }} />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
