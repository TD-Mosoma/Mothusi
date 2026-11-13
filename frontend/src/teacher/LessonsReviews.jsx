import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate, planAgainFrom, STATUS } from './format.js'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'Needs you', match: (l) => ['awaiting_review', 'returned', 'draft', 'feedback_due', 'failed'].includes(l.status) },
  { key: 'shared', label: 'Shared with learners', match: (l) => ['approved', 'feedback_due', 'completed'].includes(l.status) },
]

export default function LessonsReviews() {
  const { lessons, classes } = useTeacher()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const match = FILTERS.find((f) => f.key === filter)?.match || (() => true)
  const sorted = [...lessons].sort((a, b) => (b.date || '').localeCompare(a.date || '')).filter(match)
  const className = (id) => classes.find((c) => c.id === id)?.name

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Lesson plans</h1>
          <p className="muted">Every plan keeps its versions, the agents' checks, your edits, approval and feedback.</p>
        </div>
        <Link to="/teacher/plan" className="btn">New lesson</Link>
      </div>

      {lessons.length > 0 && (
        <div className="t-toggles" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`t-toggle ${filter === f.key ? 'on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {lessons.length === 0 && (
        <section className="card stack">
          <p>No lesson plans yet.</p>
          <div><Link to="/teacher/plan" className="btn">Prepare your first lesson</Link></div>
        </section>
      )}
      {lessons.length > 0 && sorted.length === 0 && <p className="card muted">Nothing here right now.</p>}

      <ul className="t-lessons">
        {sorted.map((l) => {
          const s = STATUS[l.status] || STATUS.draft
          return (
            <li key={l.id} className="card t-lesson-row">
              <div>
                <h2><Link to={`/teacher/lessons/${l.id}`} className="t-lesson-link">{l.topic || l.title}</Link></h2>
                <span className="muted small-text">
                  {[className(l.classId), `${l.grade} ${l.subject}`, formatDate(l.date), l.version && l.status !== 'preparing' ? `Version ${l.version}` : null]
                    .filter(Boolean).join(' • ')}
                </span>
              </div>
              <div className="row tight">
                {l.sample && <span className="chip sample">Sample</span>}
                <span className={`chip ${s.tone}`}>{s.label}</span>
                {l.status !== 'preparing' && l.status !== 'failed' && (
                  <button type="button" className="btn ghost small" onClick={() => navigate('/teacher/plan', { state: { from: planAgainFrom(l) } })}>Plan again</button>
                )}
                <Link to={`/teacher/lessons/${l.id}`} className="btn secondary small">Open</Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
