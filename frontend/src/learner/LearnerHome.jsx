import { Link, useOutletContext } from 'react-router-dom'
import FractionCircle from '../components/FractionCircle.jsx'
import { languageLabel } from '../teacher/curriculum.js'
import { useLearnerLesson, useLearnerLessons, useLearnerLink, useLearnerProgress } from './useLearnerLesson.js'
import JoinClass from './JoinClass.jsx'
import { translate } from './translations.js'

export default function LearnerHome() {
  const { lang, profile } = useOutletContext()
  const { link, loading: linkLoading, setLink } = useLearnerLink()
  const { loading, lesson, error } = useLearnerLesson(lang, null, link?.class_id)
  const { lessons, loading: lessonsLoading } = useLearnerLessons(link?.class_id)
  const notJoined = !linkLoading && !link
  const firstName = profile?.fullName?.trim().split(' ')[0]
  const { progress } = useLearnerProgress(link?.class_id)
  const completed = progress?.practice_done || 0
  const fraction = lesson?.material.practice.flatMap((q) => q.options).find((o) => o.fraction)?.fraction

  return (
    <div className="stack l-home">
      <section className="l-hero">
        <div>
          <span className="l-eyebrow">{translate(lang, 'YOUR LEARNING SPACE')}</span>
          <h1>{firstName ? translate(lang, 'Hello, {name}!', { name: firstName }) : translate(lang, 'Hello! Ready to learn?')}</h1>
          {loading && <p>{translate(lang, 'Getting your lesson ready…')}</p>}
          {error && <p>{translate(lang, 'We cannot load your lessons right now. Please ask your teacher.')}</p>}
          {notJoined && (
            <>
              <p>{translate(lang, 'Ask your teacher for your class code, then type it here to see your lessons.')}</p>
              <JoinClass lang={lang} onJoined={setLink} compact />
            </>
          )}
          {!loading && !error && !lesson && link && <p>{translate(lang, 'Your teacher has not shared a lesson yet. Check again soon!')}</p>}
          {lesson && (
            <>
              <p>{translate(lang, 'Today you are learning about {topic}. Take your time, and ask for another explanation whenever something is unclear.', { topic: lesson.topic.toLowerCase() })}</p>
              <Link to="/learner/lesson" className="btn">{translate(lang, 'Continue learning')} <span aria-hidden="true">→</span></Link>
            </>
          )}
        </div>
        <div className="l-hero-art" aria-hidden="true">
          <span className="l-hero-spark spark-one">✦</span>
          <FractionCircle parts={4} shaded={3} size={172} />
          <span className="l-hero-spark spark-two">✦</span>
        </div>
      </section>

      <section className="l-stats" aria-label={translate(lang, 'Your learning at a glance')}>
        <div className="l-stat-card stat-blue"><span className="l-stat-icon" aria-hidden="true">▤</span><span className="l-stat-label">{translate(lang, 'MY CLASS')}</span><strong>{link?.class_name || profile?.grade || translate(lang, 'Not set')}</strong></div>
        <div className="l-stat-card stat-yellow"><span className="l-stat-icon" aria-hidden="true">✦</span><span className="l-stat-label">{translate(lang, 'LESSONS SHARED')}</span><strong>{lessonsLoading ? '…' : lessons.length}</strong></div>
        <div className="l-stat-card stat-green"><span className="l-stat-icon" aria-hidden="true">✎</span><span className="l-stat-label">{translate(lang, 'PRACTICE DONE')}</span><strong>{progress ? `${completed} ${translate(lang, completed === 1 ? 'activity' : 'activities')}` : '…'}</strong></div>
        <div className="l-stat-card stat-pink"><span className="l-stat-icon" aria-hidden="true">◉</span><span className="l-stat-label">{translate(lang, 'MY LANGUAGE')}</span><strong>{languageLabel(lang)}</strong></div>
      </section>

      <section className="l-home-grid">
        <div className="l-panel l-continue">
          <div className="l-panel-heading">
            <h2>{translate(lang, 'Continue learning')}</h2>
            {lesson && <span className="l-subject-pill">{lesson.subject}</span>}
          </div>
          {lesson ? (
            <div className="l-continue-body">
              <div className="l-mini-fraction">
                {fraction ? <FractionCircle parts={fraction.parts} shaded={fraction.shaded} size={86} /> : <span className="l-mini-icon" aria-hidden="true">✦</span>}
              </div>
              <div>
                <h3>{lesson.material.title}</h3>
                <p>{translate(lang, lesson.personalised ? 'Made for you by your teacher and Mothusi.' : 'Your class lesson.')}</p>
                <Link to="/learner/lesson" className="btn">{translate(lang, 'Continue lesson')} <span aria-hidden="true">→</span></Link>
              </div>
            </div>
          ) : (
            <p className="muted">{translate(lang, 'When your teacher shares a lesson, it will appear here.')}</p>
          )}
        </div>
        <div className="l-panel l-quick">
          <h2>{translate(lang, 'Quick actions')}</h2>
          <Link to="/learner/lesson"><span aria-hidden="true">▶</span> {translate(lang, 'Continue a lesson')} <span aria-hidden="true">›</span></Link>
          <Link to="/learner/practice"><span aria-hidden="true">✎</span> {translate(lang, 'Practise a topic')} <span aria-hidden="true">›</span></Link>
          <Link to="/learner/preferences"><span aria-hidden="true">◉</span> {translate(lang, 'Change language')} <span aria-hidden="true">›</span></Link>
          <Link to="/learner/saved"><span aria-hidden="true">♡</span> {translate(lang, 'View saved learning')} <span aria-hidden="true">›</span></Link>
        </div>
      </section>
      <p className="l-home-note"><span aria-hidden="true">🌟</span> {translate(lang, 'Learn at your own pace. Ask for another explanation whenever something is unclear.')}</p>
    </div>
  )
}
