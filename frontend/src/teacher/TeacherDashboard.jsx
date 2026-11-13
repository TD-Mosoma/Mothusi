import { Link } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function TeacherDashboard() {
  const { profile, classes, lessons } = useTeacher()

  const active = classes.filter((c) => !c.archived)
  const learnerTotal = active.reduce((n, c) => n + Number(c.size || 0), 0)
  const drafts = lessons.filter((l) => l.status === 'draft').length
  const awaiting = lessons.filter((l) => l.status === 'awaiting_review')
  const feedbackDue = lessons.filter((l) => l.status === 'feedback_due')
  const first = profile.fullName.trim().split(' ')[0]

  const priorities = [
    ...awaiting.map((l) => ({ key: `r-${l.id}`, to: `/teacher/lessons/${l.id}`, text: `Review ${l.title}` })),
    ...feedbackDue.map((l) => ({ key: `f-${l.id}`, to: `/teacher/lessons/${l.id}/feedback`, text: `Submit feedback for ${l.title}` })),
    { key: 'next', to: '/teacher/plan', text: 'Prepare support for your next lesson' },
  ]

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>{greeting()}, {first}</h1>
          <p className="muted">Your classroom overview and what needs your attention today.</p>
        </div>
        <div className="row">
          <Link to="/teacher/plan" className="btn">+ Create lesson</Link>
          <Link to="/teacher/activity" className="btn secondary">Agent activity</Link>
        </div>
      </div>

      <section className="t-stats" aria-label="Overview">
        <Link to="/teacher/classes" className="t-stat">
          <span className="t-stat-label">My classes</span>
          <strong>{active.length} active {active.length === 1 ? 'class' : 'classes'}</strong>
        </Link>
        <Link to="/teacher/profiles" className="t-stat">
          <span className="t-stat-label">Learners</span>
          <strong>{learnerTotal} learners</strong>
        </Link>
        <Link to="/teacher/lessons" className="t-stat">
          <span className="t-stat-label">Lesson plans</span>
          <strong>{drafts} {drafts === 1 ? 'draft' : 'drafts'} • {awaiting.length} awaiting review</strong>
        </Link>
        <Link to="/teacher/lessons" className="t-stat">
          <span className="t-stat-label">Feedback due</span>
          <strong>{feedbackDue.length} lesson {feedbackDue.length === 1 ? 'review' : 'reviews'}</strong>
        </Link>
      </section>

      <div className="t-columns">
        <section className="card stack">
          <h2>Today's priorities</h2>
          <ul className="t-list">
            {priorities.map((p) => (
              <li key={p.key}><Link to={p.to}>{p.text}</Link></li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2>Quick actions</h2>
          <ul className="t-list">
            <li><Link to="/teacher/plan">Create a lesson plan</Link></li>
            <li><Link to="/teacher/profiles">Open learner profiles</Link></li>
            <li><Link to="/teacher/classes">View my classes</Link></li>
            <li><Link to="/teacher/lessons">Review agent recommendations</Link></li>
            <li><Link to="/teacher/activity">Watch the agents at work</Link></li>
          </ul>
        </section>
      </div>

      <p className="t-note">
        You make the decisions. Review, edit or approve every recommendation Mothusi prepares.
      </p>
    </div>
  )
}
