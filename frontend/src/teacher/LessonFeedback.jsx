import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDate, todayISO } from './format.js'
import { submitFeedback } from '../services/api.js'
import InlineRun from '../components/InlineRun.jsx'

const OVERALL = ['Worked well', 'Partly worked', 'Did not work']
const OUTCOMES = ['Not rated', 'Worked', 'Partly worked', 'Did not work']

export default function LessonFeedback() {
  const { id } = useParams()
  const { lessons, updateLesson } = useTeacher()
  const lesson = lessons.find((l) => l.id === id)

  const [taughtOn, setTaughtOn] = useState(lesson?.date || todayISO())
  const [overall, setOverall] = useState('')
  const [ratings, setRatings] = useState({})
  const [happened, setHappened] = useState('')
  const [change, setChange] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [runId, setRunId] = useState(null)
  const [pending, setPending] = useState(null)

  if (!lesson) {
    return (
      <div className="stack">
        <h1>Lesson not found</h1>
        <p><Link to="/teacher/lessons">Back to lesson plans</Link></p>
      </div>
    )
  }

  const adaptations = lesson.adaptations.filter((a) => !a.removed)

  const submit = async (e) => {
    e.preventDefault()
    if (!overall) return setError('Choose how well the lesson plan worked overall.')
    setSaving(true); setError('')
    const feedback = {
      overall, taughtOn, ratings, happened: happened.trim(), change: change.trim(), submittedAt: new Date().toISOString(),
    }
    const outcomes = adaptations
      .filter((a) => ratings[a.id] && ratings[a.id] !== 'Not rated')
      .map((a) => ({
        adaptation_id: a.id, learner_id: a.learnerId, learner_label: a.learner, strategy: a.strategy,
        instruction: a.text, outcome: ratings[a.id],
      }))
    try {
      const id = await submitFeedback({
        run_id: lesson.runId, lesson_id: lesson.id, overall, happened: feedback.happened, change: feedback.change, outcomes,
      })
      setPending(feedback)
      setRunId(id)
    } catch (err) {
      setError(`Your feedback could not be sent: ${err.message}`)
      setSaving(false)
    }
  }

  const recorded = (run) => {
    updateLesson(lesson.id, (l) => ({
      feedback: pending,
      status: 'completed',
      history: [...l.history, { at: pending.submittedAt, by: 'Teacher', note: `Submitted lesson feedback: ${pending.overall}`, runId: run.id }],
    }))
    setSaving(false)
  }

  if (runId) {
    return (
      <div className="stack">
        <h1>Thank you. Mothusi is learning from this lesson</h1>
        <InlineRun runId={runId} title="Progress Tracker" onDone={recorded}
          onFail={(msg) => { setError(msg); setRunId(null); setSaving(false) }} />
        {lesson.status === 'completed' && (
          <div className="row">
            <Link to="/teacher/plan" className="btn">Plan the next lesson</Link>
            <Link to={`/teacher/lessons/${lesson.id}`} className="btn secondary">Back to this lesson</Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Submit lesson feedback</h1>
          <p className="muted">Tell Mothusi what worked so future recommendations can improve.</p>
        </div>
      </div>

      <form className="card stack" onSubmit={submit} noValidate>
        <div className="t-form-grid">
          <div className="t-field">Lesson taught
            <p className="t-static">{lesson.title}</p>
          </div>
          <label className="t-field">Lesson date
            <input type="date" value={taughtOn} onChange={(e) => setTaughtOn(e.target.value)} />
            <span className="t-hint">Planned for {formatDate(lesson.date)}</span>
          </label>
        </div>

        <fieldset className="t-fieldset">
          <legend>Overall experience: how well did the lesson plan work in your classroom?</legend>
          <div className="t-segment" role="radiogroup" aria-label="Overall experience">
            {OVERALL.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={overall === o}
                className={`t-seg-btn ${overall === o ? 'on' : ''}`} onClick={() => setOverall(o)}>{o}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="t-fieldset">
          <legend>How did each adaptation go?</legend>
          <span className="t-hint">Strategies you mark "Did not work" are avoided in future plans for that learner.</span>
          {adaptations.map((a) => (
            <div key={a.id} className="t-rate-row">
              <span><span className="chip">{a.learner}</span> <strong>{a.strategy}</strong>: {a.text}</span>
              <select aria-label={`Outcome for ${a.learner}: ${a.text}`} value={ratings[a.id] || 'Not rated'}
                onChange={(e) => setRatings((r) => ({ ...r, [a.id]: e.target.value }))}>
                {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </fieldset>

        <label className="t-field">What happened?
          <textarea rows="3" value={happened} onChange={(e) => setHappened(e.target.value)}
            placeholder="For example: learners understood the visual example but needed more guided practice." />
        </label>
        <label className="t-field">What should change next time?
          <textarea rows="3" value={change} onChange={(e) => setChange(e.target.value)}
            placeholder="For example: add two short guided examples before independent practice." />
        </label>

        {error && <p className="t-error" role="alert">{error}</p>}
        <div className="row">
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Submitting...' : 'Submit feedback'}</button>
          <Link to={`/teacher/lessons/${lesson.id}`} className="btn secondary">Cancel</Link>
        </div>
        <p className="t-hint">The Progress Tracker stores this and brings it into your next plans. The AI model itself is not retrained.</p>
      </form>
    </div>
  )
}
