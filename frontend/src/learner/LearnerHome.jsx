import { Link, useOutletContext } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { languageLabel } from '../teacher/curriculum.js'
import { getCompletedActivities } from '../services/learnerPortal.js'
import { useLearnerLesson, useLearnerLessons } from './useLearnerLesson.js'

export default function LearnerHome() {
  const { lang, profile } = useOutletContext()
  const { loading, lesson, error } = useLearnerLesson(profile?.code, lang)
  const { lessons } = useLearnerLessons()
  const firstName = profile?.fullName?.trim().split(' ')[0]
  const completed = getCompletedActivities()
  const fraction = lesson?.material.practice.flatMap((q) => q.options).find((o) => o.fraction)?.fraction

  return (
    <div className="stack l-home">
      <section className="l-hero">
        <div>
          <span className="l-eyebrow">YOUR LEARNING SPACE</span>
          <h1>{firstName ? `Hello, ${firstName}!` : 'Hello! Ready to learn?'}</h1>
          {loading && <p>Getting your lesson ready…</p>}
          {error && <p>We cannot load your lessons right now. Please ask your teacher.</p>}
          {!loading && !error && !lesson && <p>Your teacher has not shared a lesson yet. Check again soon!</p>}
          {lesson && (
            <>
              <p>Today you are learning about <strong>{lesson.topic.toLowerCase()}</strong>. Take your time, and ask for another explanation whenever something is unclear.</p>
              <Link to="/learner/lesson" className="btn">Continue learning <span aria-hidden="true">→</span></Link>
            </>
          )}
        </div>
        <div className="l-hero-art" aria-hidden="true">
          <span className="l-hero-spark spark-one">✦</span>
          <FractionCircle parts={4} shaded={3} size={172} />
          <span className="l-hero-spark spark-two">✦</span>
        </div>
      </section>

      <section className="l-stats" aria-label="Your learning at a glance">
        <div className="l-stat-card stat-blue"><span className="l-stat-icon" aria-hidden="true">▤</span><span className="l-stat-label">MY CLASS</span><strong>{profile?.grade || 'Not set'}</strong></div>
        <div className="l-stat-card stat-yellow"><span className="l-stat-icon" aria-hidden="true">✦</span><span className="l-stat-label">LESSONS SHARED</span><strong>{lessons.length}</strong></div>
        <div className="l-stat-card stat-green"><span className="l-stat-icon" aria-hidden="true">✎</span><span className="l-stat-label">PRACTICE DONE</span><strong>{completed} {completed === 1 ? 'activity' : 'activities'}</strong></div>
        <div className="l-stat-card stat-pink"><span className="l-stat-icon" aria-hidden="true">◉</span><span className="l-stat-label">MY LANGUAGE</span><strong>{languageLabel(lang)}</strong></div>
      </section>

      <section className="l-home-grid">
        <div className="l-panel l-continue">
          <div className="l-panel-heading">
            <h2>Continue learning</h2>
            {lesson && <span className="l-subject-pill">{lesson.subject}</span>}
          </div>
          {lesson ? (
            <div className="l-continue-body">
              <div className="l-mini-fraction">
                {fraction ? <FractionCircle parts={fraction.parts} shaded={fraction.shaded} size={86} /> : <span className="l-mini-icon" aria-hidden="true">✦</span>}
              </div>
              <div>
                <h3>{lesson.material.title}</h3>
                <p>{lesson.personalised ? 'Made for you by your teacher and Mothusi.' : 'Your class lesson.'}</p>
                <Link to="/learner/lesson" className="btn">Continue lesson <span aria-hidden="true">→</span></Link>
              </div>
            </div>
          ) : (
            <p className="muted">When your teacher shares a lesson, it will appear here.</p>
          )}
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
