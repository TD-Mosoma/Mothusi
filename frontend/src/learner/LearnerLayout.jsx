import { useState } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import LanguagePicker from '../components/LanguagePicker.jsx'
import './learner.css'
import { getLearnerProfile } from '../services/profile.js'

export default function LearnerLayout() {
  const [lang, setLang] = useState(getLearnerProfile()?.language || 'en')
  return (
    <div className="theme-learner learner-shell">
      <header className="l-top">
        <Link to="/" className="l-logo">Mothusi</Link>
        <nav className="l-nav" aria-label="Learner navigation">
          <NavLink to="/learner" end>Home</NavLink>
          <NavLink to="/learner/lesson">My lesson</NavLink>
        </nav>
        <LanguagePicker value={lang} onChange={setLang} />
      </header>
      <main className="l-main">
        <Outlet context={{ lang }} />
      </main>
    </div>
  )
}
