import { Link } from 'react-router-dom'
import logo from '../assets/logo.jpeg'
import './SiteChrome.css'

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-logo" aria-label="Mothusi, home">
          <img src={logo} alt="Mothusi: your intelligent classroom colleague" />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#about">What is Mothusi?</a>
          <a href="#journey">How it works</a>
          <span className="site-nav-actions">
            <a href="#choose" className="site-nav-cta">Get started</a>
            <Link to="/login" className="site-nav-login">Log in</Link>
          </span>
        </nav>
      </div>
    </header>
  )
}