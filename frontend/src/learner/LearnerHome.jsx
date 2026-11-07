import { Link } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { getLearnerProfile } from '../services/profile.js'

export default function LearnerHome() {
  const profile = getLearnerProfile()
  const firstName = profile?.fullName?.trim().split(' ')[0]
  return (
    <div className="stack">
      <section className="l-hero card">
        <div>
          <h1>{firstName ? `Hello, ${firstName}!` : 'Hello! Ready to learn?'}</h1>
          <p>Today you are learning about fractions. Take your time. You can ask for another explanation at any point.</p>
          <Link to="/learner/lesson" className="btn">Start my lesson</Link>
        </div>
        <div className="l-hero-art" aria-hidden="true">
          <FractionCircle parts={4} shaded={3} size={180} />
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Today</h3>
          <p>Sharing a pizza: what is a fraction?</p>
          <span className="chip">About 15 minutes</span>
        </div>
        <div className="card">
          <h3>Your stars</h3>
          <p className="l-stars" aria-label="2 stars earned">★ ★ <span className="muted">☆ ☆ ☆</span></p>
          <span className="chip ok">2 of 5 done</span>
        </div>
      </section>
    </div>
  )
}
