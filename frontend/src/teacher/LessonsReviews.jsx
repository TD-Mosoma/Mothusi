import { Link } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate, STATUS } from './format.js'

export default function LessonsReviews() {
  const { lessons } = useTeacher()
  const sorted = [...lessons].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Lesson Plans &amp; Reviews</h1>
          <p className="muted">Track drafts, approved plans and feedback submitted after teaching.</p>
        </div>
        <Link to="/teacher/plan" className="btn">+ Create lesson</Link>
      </div>

      {sorted.length === 0 && <p className="card muted">No lesson plans yet. Create your first one.</p>}

      <ul className="t-lessons">
        {sorted.map((l) => {
          const s = STATUS[l.status] || STATUS.draft
          return (
            <li key={l.id} className="card t-lesson-row">
              <div>
                <h2>{l.title}</h2>
                <span className="muted">{formatDate(l.date)} • Version {l.version}</span>
              </div>
              <div className="row tight">
                <span className={`chip ${s.tone}`}>{s.label}</span>
                <Link to={`/teacher/lessons/${l.id}`} className="btn secondary small">Open</Link>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="t-note">
        Every plan keeps its versions, agent checks, your edits, approval status and post-lesson feedback.
      </p>
    </div>
  )
}
