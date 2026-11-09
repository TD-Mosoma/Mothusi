import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTeacher } from './TeacherContext.jsx'
import { formatDateTime } from './format.js'

const CHANGE_TYPES = ['Edit recommendation', 'Remove recommendation']

export default function LessonEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lessons, updateLesson } = useTeacher()
  const lesson = lessons.find((l) => l.id === id)

  const adaptations = lesson ? lesson.adaptations.filter((a) => !a.removed) : []
  const [adaptId, setAdaptId] = useState(adaptations[0]?.id || '')
  const [changeType, setChangeType] = useState(CHANGE_TYPES[0])
  const [text, setText] = useState(adaptations[0]?.text || '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!lesson) {
    return (
      <div className="stack">
        <h1>Lesson not found</h1>
        <p><Link to="/teacher/lessons">Back to lesson plans</Link></p>
      </div>
    )
  }

  const current = adaptations.find((a) => a.id === adaptId)
  const stamp = () => new Date().toISOString()
  const back = () => navigate(`/teacher/lessons/${lesson.id}`)

  const pick = (value) => {
    setAdaptId(value)
    setText(adaptations.find((a) => a.id === value)?.text || '')
  }

  const save = (e) => {
    e.preventDefault()
    if (!current) return setError('There is no recommendation left to change.')
    if (changeType === 'Edit recommendation' && text.trim().length < 3) return setError('Write your revised instruction.')

    updateLesson(lesson.id, (l) => ({
      version: l.version + 1,
      needsRecheck: true,
      status: 'awaiting_review',
      adaptations: l.adaptations.map((a) => {
        if (a.id !== current.id) return a
        return changeType === 'Remove recommendation'
          ? { ...a, removed: true }
          : { ...a, text: text.trim(), edited: true }
      }),
      history: [
        ...l.history,
        {
          at: stamp(), by: 'Teacher',
          note: `${changeType === 'Remove recommendation' ? 'Removed' : 'Edited'} the recommendation for ${current.learner}`,
          reason: reason.trim(),
          before: current.text,
          after: changeType === 'Remove recommendation' ? '' : text.trim(),
        },
      ],
    }))
    back()
  }

  const requestRework = () => {
    if (reason.trim().length < 3) return setError('Tell Mothusi what to rework in the box below.')
    updateLesson(lesson.id, (l) => ({
      status: 'returned',
      note: reason.trim(),
      history: [...l.history, { at: stamp(), by: 'Teacher', note: 'Requested rework', reason: reason.trim() }],
    }))
    back()
  }

  const edits = lesson.history.filter((h) => h.before !== undefined)

  return (
    <div className="stack">
      <div className="t-page-head">
        <div>
          <h1>Edit or request changes</h1>
          <p className="muted">You stay in control of the final lesson plan. {lesson.title}</p>
        </div>
      </div>

      <form className="card stack" onSubmit={save} noValidate>
        <div className="t-form-grid">
          <label className="t-field">Section to change
            <select value={adaptId} onChange={(e) => pick(e.target.value)}>
              {adaptations.map((a) => <option key={a.id} value={a.id}>Adaptations for {a.learner}</option>)}
            </select>
          </label>
          <label className="t-field">Change type
            <select value={changeType} onChange={(e) => setChangeType(e.target.value)}>
              {CHANGE_TYPES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>

        {current && <p className="muted"><strong>Mothusi's original suggestion:</strong> {current.original}</p>}

        {changeType === 'Edit recommendation' && (
          <label className="t-field">Your revised instruction
            <textarea rows="3" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}

        <label className="t-field">Reason or feedback to Mothusi
          <textarea rows="3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the learner responds better to one instruction at a time." />
        </label>

        {error && <p className="t-error" role="alert">{error}</p>}
        <div className="row">
          <button type="submit" className="btn">Save edit</button>
          <button type="button" className="btn secondary" onClick={requestRework}>Request rework</button>
          <button type="button" className="btn ghost" onClick={back}>Cancel</button>
        </div>
        <p className="t-hint">Edited content is re-checked before you give final approval.</p>
      </form>

      <section className="card stack">
        <h2>Change history</h2>
        {edits.length === 0 && <p className="muted">No edits yet. Mothusi's original suggestions are kept.</p>}
        <ul className="t-history">
          {[...edits].reverse().map((h, i) => (
            <li key={i}>
              <strong>{h.note}</strong>
              <span className="muted small-text">{formatDateTime(h.at)}</span>
              <span className="small-text">Before: {h.before}</span>
              {h.after && <span className="small-text">After: {h.after}</span>}
              {h.reason && <span className="small-text">Reason: {h.reason}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
