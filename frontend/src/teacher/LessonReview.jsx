import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate, formatDateTime, STATUS } from './format.js'
import { recheckLesson } from '../services/api.js'

export default function LessonReview() {
  const { id } = useParams()
  const { lessons, updateLesson } = useTeacher()
  const lesson = lessons.find((l) => l.id === id)

  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  if (!lesson) {
    return (
      <div className="stack">
        <h1>Lesson not found</h1>
        <p><Link to="/teacher/lessons">Back to lesson plans</Link></p>
      </div>
    )
  }

  const s = STATUS[lesson.status] || STATUS.draft
  const adaptations = lesson.adaptations.filter((a) => !a.removed)
  const canDecide = ['awaiting_review', 'returned', 'draft'].includes(lesson.status)
  const canGiveFeedback = ['approved', 'feedback_due'].includes(lesson.status)
  const stamp = () => new Date().toISOString()

  const approve = () =>
    updateLesson(lesson.id, (l) => ({
      status: 'approved',
      note: '',
      history: [...l.history, { at: stamp(), by: 'Teacher', note: `Approved version ${l.version}` }],
    }))

  const confirmReturn = () => {
    if (reason.trim().length < 3) return setError('Tell Mothusi what should change.')
    updateLesson(lesson.id, (l) => ({
      status: 'returned',
      note: reason.trim(),
      history: [...l.history, { at: stamp(), by: 'Teacher', note: 'Returned for changes', reason: reason.trim() }],
    }))
    setReturning(false); setReason(''); setError('')
  }

  const recheck = async () => {
    setChecking(true); setError('')
    try {
      await recheckLesson(lesson)
      updateLesson(lesson.id, (l) => ({
        needsRecheck: false,
        history: [...l.history, { at: stamp(), by: 'Mothusi', note: `Re-checked version ${l.version}: objective and constraints still met` }],
      }))
    } catch {
      setError('The re-check could not finish. Try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>{canDecide ? 'Review your lesson plan' : 'Lesson plan'}</h1>
          <p className="muted">
            {canDecide ? 'This is an agent-generated draft. Check it before approving the plan.' : `${lesson.title}, ${formatDate(lesson.date)}`}
          </p>
        </div>
        <span className={`chip ${s.tone}`}>{s.label}</span>
      </div>

      <section className="card stack">
        <h2>{lesson.grade} {lesson.subject} • {lesson.topic}</h2>
        <p><strong>Objective:</strong> {lesson.objectives}</p>
        {lesson.attachedResource && <p className="muted">Curriculum material attached: {lesson.attachedResource}</p>}
        {lesson.note && <p className="t-note">Your note to Mothusi: {lesson.note}</p>}
        {lesson.needsRecheck && <p className="t-note">You edited this plan. Mothusi needs to re-check it before you can approve.</p>}
      </section>

      <div className="t-columns">
        <section className="card stack">
          <h2>Lesson flow</h2>
          <ul className="t-list">
            {lesson.flow.map((f) => (
              <li key={f.label} className="t-list-row"><span>{f.label}</span><span className="muted">{f.min} min</span></li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2>Feasibility check</h2>
          <ul className="t-checks">
            {lesson.feasibility.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <h3>Quality checks</h3>
          <ul className="t-checks">
            {lesson.checks.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      </div>

      <section className="card stack">
        <h2>Recommended adaptations</h2>
        {adaptations.length === 0 && <p className="muted">All recommendations were removed.</p>}
        <ul className="t-list">
          {adaptations.map((a) => (
            <li key={a.id} className="t-rec">
              <div>
                <span className="chip">{a.learner}</span>
                <p>{a.text}</p>
                {a.edited && <span className="muted small-text">Edited by you</span>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {canDecide && (
        <section className="card stack">
          <h2>Your decision</h2>
          <p className="muted">Approve, edit or return the plan. Approval is recorded with the version and date.</p>

          {lesson.needsRecheck && (
            <div className="row">
              <button type="button" className="btn" onClick={recheck} disabled={checking}>
                {checking ? 'Re-checking...' : 'Re-check edited plan'}
              </button>
            </div>
          )}

          {!returning && (
            <div className="row">
              <button type="button" className="btn" onClick={approve} disabled={lesson.needsRecheck}>Approve</button>
              <Link to={`/teacher/lessons/${lesson.id}/edit`} className="btn secondary">Edit</Link>
              <button type="button" className="btn secondary" onClick={() => setReturning(true)}>Return</button>
            </div>
          )}

          {returning && (
            <div className="stack">
              <label className="t-field">What should Mothusi change?
                <textarea rows="3" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="row">
                <button type="button" className="btn" onClick={confirmReturn}>Return to Mothusi</button>
                <button type="button" className="btn secondary" onClick={() => { setReturning(false); setError('') }}>Cancel</button>
              </div>
            </div>
          )}
          {error && <p className="t-error" role="alert">{error}</p>}
        </section>
      )}

      {canGiveFeedback && (
        <section className="card stack">
          <h2>After you teach</h2>
          <p className="muted">Tell Mothusi what worked so future recommendations improve.</p>
          <div className="row">
            <Link to={`/teacher/lessons/${lesson.id}/feedback`} className="btn">Submit feedback</Link>
          </div>
        </section>
      )}

      {lesson.status === 'completed' && lesson.feedback && (
        <section className="card stack">
          <h2>Feedback you submitted</h2>
          <p><strong>Overall:</strong> {lesson.feedback.overall}</p>
          {lesson.feedback.happened && <p><strong>What happened:</strong> {lesson.feedback.happened}</p>}
          {lesson.feedback.change && <p><strong>What to change next time:</strong> {lesson.feedback.change}</p>}
        </section>
      )}

      <section className="card stack">
        <h2>Review record</h2>
        <p className="muted">Version {lesson.version}</p>
        <ul className="t-history">
          {[...lesson.history].reverse().map((h, i) => (
            <li key={i}>
              <strong>{h.note}</strong>
              <span className="muted small-text">{h.by} • {formatDateTime(h.at)}</span>
              {h.reason && <span className="small-text">Reason: {h.reason}</span>}
            </li>
          ))}
        </ul>
      </section>

      <p><Link to="/teacher/lessons">Back to all lesson plans</Link></p>
    </div>
  )
}
