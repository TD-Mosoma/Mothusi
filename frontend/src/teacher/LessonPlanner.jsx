import { useState } from 'react'
import { generateSupportPack, submitFeedback } from '../services/api.js'

const CONSTRAINTS = [
  { key: 'noPrinter', label: 'No printer available', on: true },
  { key: 'largeClass', label: 'Large class (40 learners)', on: true },
  { key: 'limitedTime', label: 'Only 5 minutes of one-to-one time', on: true },
  { key: 'noisyHall', label: 'Lesson is in a noisy hall', on: false },
]

export default function LessonPlanner() {
  const [constraints, setConstraints] = useState(CONSTRAINTS)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState({})

  const toggle = (key) =>
    setConstraints((cs) => cs.map((c) => (c.key === key ? { ...c, on: !c.on } : c)))

  const generate = async () => {
    setLoading(true); setError('')
    try {
      setResult(await generateSupportPack({ constraints }))
    } catch {
      setError('Mothusi could not build the pack. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const mark = async (id, worked) => {
    setFeedback((f) => ({ ...f, [id]: worked }))
    await submitFeedback({ recommendationId: id, worked })
  }

  return (
    <div className="stack">
      <h1>Plan a lesson</h1>

      <div className="t-columns">
        <section className="card stack">
          <h2>Lesson</h2>
          <label className="t-field">Topic
            <input defaultValue="Introducing fractions" />
          </label>
          <label className="t-field">Learning objective
            <textarea rows="3" defaultValue="Learners can name and show simple fractions of a whole." />
          </label>

          <fieldset className="t-fieldset">
            <legend>Classroom constraints</legend>
            {constraints.map((c) => (
              <label key={c.key} className="t-check">
                <input type="checkbox" checked={c.on} onChange={() => toggle(c.key)} />
                {c.label}
              </label>
            ))}
          </fieldset>

          <button className="btn" onClick={generate} disabled={loading}>
            {loading ? 'Building your pack...' : result ? 'Rebuild support pack' : 'Build support pack'}
          </button>
          {error && <p className="t-error" role="alert">{error}</p>}
        </section>

        <section className="card stack">
          <h2>How Mothusi worked on this</h2>
          {!result && <p className="muted">Build the pack to see each step and any corrections Mothusi made.</p>}
          {result && (
            <ol className="t-timeline">
              {result.steps.map((s, i) => (
                <li key={i} className={s.status}>
                  <strong>{s.agent}</strong>
                  <span>{s.note}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {result && (
        <section className="card stack">
          <h2>Recommended adaptations</h2>
          <p className="muted">Review each one before you use it. Tell Mothusi what worked so it can plan better next time.</p>
          {result.recommendations.map((r) => (
            <div key={r.id} className="t-rec">
              <div>
                <span className="chip">{r.learner}</span>
                <p>{r.text}</p>
              </div>
              <div className="row">
                <button className={`btn secondary ${feedback[r.id] === true ? 'sel' : ''}`} onClick={() => mark(r.id, true)}>Worked</button>
                <button className={`btn secondary ${feedback[r.id] === false ? 'sel' : ''}`} onClick={() => mark(r.id, false)}>Did not work</button>
              </div>
            </div>
          ))}
          <div className="row"><button className="btn">Approve support pack</button></div>
        </section>
      )}
    </div>
  )
}
