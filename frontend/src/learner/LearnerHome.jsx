import { Link } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { getLearnerProfile } from '../services/profile.js'
import { getCompletedActivities } from '../services/learnerPortal.js'

export default function LearnerHome() {
  const profile = getLearnerProfile()
  const firstName = profile?.fullName?.trim().split(' ')[0]
  const completed = getCompletedActivities()
  return (
    <div className="stack l-home">
      <section className="l-hero">
        <div>
          <span className="l-eyebrow">YOUR LEARNING SPACE</span>
          <h1>{firstName ? `Hello, ${firstName}!` : 'Hello! Ready to learn?'}</h1>
          <p>Your learning space, with lessons and activities chosen for your class and the way you like to learn.</p>
          <Link to="/learner/lesson" className="btn">Continue learning <span aria-hidden="true">→</span></Link>
        </div>
        <div className="l-hero-art" aria-hidden="true">
          <span className="l-hero-spark spark-one">✦</span>
          <FractionCircle parts={4} shaded={3} size={172} />
          <span className="l-hero-spark spark-two">✦</span>
        </div>
      </section>

      <section className="l-stats" aria-label="Your learning at a glance">
        <div className="l-stat-card stat-blue"><span className="l-stat-icon" aria-hidden="true">▤</span><span className="l-stat-label">MY CLASS</span><strong>{profile?.grade || 'Grade 4'}</strong></div>
        <div className="l-stat-card stat-yellow"><span className="l-stat-icon" aria-hidden="true">✦</span><span className="l-stat-label">THIS WEEK</span><strong>{completed || 3} topics</strong></div>
        <div className="l-stat-card stat-green"><span className="l-stat-icon" aria-hidden="true">✎</span><span className="l-stat-label">PRACTICE</span><strong>{Math.max(0, 2 - completed)} activities left</strong></div>
        <div className="l-stat-card stat-pink"><span className="l-stat-icon" aria-hidden="true">⚡</span><span className="l-stat-label">MY STREAK</span><strong>3 learning days</strong></div>
      </section>

      <section className="l-home-grid">
        <div className="l-panel l-continue">
          <div className="l-panel-heading"><h2>Continue learning</h2><span className="l-subject-pill">Mathematics</span></div>
          <div className="l-continue-body">
            <div className="l-mini-fraction"><FractionCircle parts={4} shaded={1} size={86} /></div>
            <div><h3>Fractions</h3><p>You last explored halves and quarters.<br />Next: try a visual fraction activity.</p>
              <Link to="/learner/lesson" className="btn">Continue lesson <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
        <div className="l-panel l-quick">
          <h2>Quick actions</h2>
          <Link to="/learner/lesson"><span aria-hidden="true">▶</span> Continue a lesson <span aria-hidden="true">›</span></Link>
          <Link to="/learner/practice"><span aria-hidden="true">✎</span> Practise a topic <span aria-hidden="true">›</span></Link>
          <Link to="/learner/preferences"><span aria-hidden="true">◉</span> Change language <span aria-hidden="true">›</span></Link>
          <Link to="/learner/saved"><span aria-hidden="true">♡</span> View saved learning <span aria-hidden="true">›</span></Link>
        </div>
      </section>
      <p className="l-home-note"><span aria-hidden="true">🌟</span> Learn at your own pace. Ask for another explanation whenever something is unclear.</p>
    </div>
  )
}
